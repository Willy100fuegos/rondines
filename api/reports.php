<?php
// api/reports.php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

require_once 'db.php';
ini_set('display_errors', 0);

$method = $_SERVER['REQUEST_METHOD'];

// ---------------------------------------------------------
// 1. RECIBIR REPORTES DESDE LA APP MÓVIL (POST)
// ---------------------------------------------------------
if ($method === 'POST') {
    $data = json_decode(file_get_contents("php://input"));
    
    if (empty($data) || !isset($data->reports)) {
        http_response_code(400); 
        echo json_encode(['status' => 'error', 'message' => 'Estructura de datos incompleta.']); 
        exit;
    }

    try {
        $pdo->beginTransaction();
        
        $stmt = $pdo->prepare("INSERT INTO reports (folio, tenant_id, user_id, round_id, category, description, gps_lat, gps_lng, photo_1, photo_2, photo_3, captured_at) VALUES (:folio, :tenant_id, :user_id, :round_id, :category, :description, :gps_lat, :gps_lng, :photo_1, :photo_2, :photo_3, :captured_at)");
        
        $inserted = 0;
        
        // Directorio dinámico por Año y Mes (Ej. ../uploads/2026/05/)
        $relative_dir = 'uploads/' . date('Y/m') . '/';
        $upload_dir = '../' . $relative_dir;
        $base_url = 'https://rondines.goratrack.link/'; // URL base para enviar a n8n
        
        if (!file_exists($upload_dir)) {
            mkdir($upload_dir, 0777, true); // Crea las carpetas recursivamente si no existen
        }

        foreach ($data->reports as $rep) {
            $photo_paths = [null, null, null];
            // Array para almacenar las URLs públicas que enviaremos a n8n
            $public_photo_urls = [];
            
            // Decodificar imágenes comprimidas (Base64) y guardarlas físicamente
            if (isset($rep->photos) && is_array($rep->photos)) {
                foreach ($rep->photos as $index => $base64_string) {
                    if ($index > 2 || empty($base64_string)) continue; 
                    
                    // Limpiar la cabecera (data:image/jpeg;base64,) para obtener solo el binario
                    $image_parts = explode(";base64,", $base64_string);
                    $image_base64 = base64_decode($image_parts[1] ?? $image_parts[0]);
                    
                    if ($image_base64) {
                        $filename = 'REP_' . $rep->folio . '_' . uniqid() . '.jpg';
                        $filepath = $upload_dir . $filename;
                        
                        file_put_contents($filepath, $image_base64);
                        
                        // Guardar la ruta relativa para la base de datos (como estaba antes)
                        $relative_path = $relative_dir . $filename;
                        $photo_paths[$index] = $relative_path;
                        
                        // Construir la URL pública absoluta para n8n
                        $public_photo_urls[] = $base_url . $relative_path;
                    }
                }
            }

            $stmt->execute([
                ':folio'       => $rep->folio,
                ':tenant_id'   => $rep->tenant_id,
                ':user_id'     => $rep->user_id,
                ':round_id'    => $rep->round_id ?? null,
                ':category'    => $rep->category,
                ':description' => $rep->description,
                ':gps_lat'     => $rep->lat ?? null,
                ':gps_lng'     => $rep->lng ?? null,
                ':photo_1'     => $photo_paths[0],
                ':photo_2'     => $photo_paths[1],
                ':photo_3'     => $photo_paths[2],
                ':captured_at' => date('Y-m-d H:i:s', strtotime($rep->timestamp))
            ]);
            
            // ---------------------------------------------------------
            // INTEGRACIÓN N8N: Enviar datos y URLs de fotos
            // ---------------------------------------------------------
            $webhook_url = 'https://n8n.pixmedia.agency/webhook/f91b61d3-09a7-4feb-9990-426d2f4fbac6';
            
            $payload = json_encode([
                'folio'       => $rep->folio,
                'category'    => $rep->category,
                'description' => $rep->description,
                'captured_at' => date('Y-m-d H:i:s', strtotime($rep->timestamp)),
                'user_id'     => $rep->user_id,
                'photos'      => $public_photo_urls // Enviamos el array de URLs públicas
            ]);

            $ch = curl_init($webhook_url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
            curl_setopt($ch, CURLOPT_TIMEOUT, 2); 
            curl_exec($ch);
            curl_close($ch);
            // ---------------------------------------------------------

            $inserted++;
        }
        
        $pdo->commit();
        echo json_encode(['status' => 'success', 'message' => "$inserted reportes guardados exitosamente."]);
        
    } catch (Exception $e) {
        $pdo->rollBack();
        http_response_code(500); 
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
} 

// ---------------------------------------------------------
// 2. CONSULTAR REPORTES DESDE EL PANEL ADMIN (GET)
// ---------------------------------------------------------
elseif ($method === 'GET') {
    $tenant_id = $_GET['tenant_id'] ?? 0;
    $start = $_GET['start'] ?? date('Y-m-d', strtotime('-7 days'));
    $end = $_GET['end'] ?? date('Y-m-d');
    
    try {
        $stmt = $pdo->prepare("
            SELECT r.*, u.name as guard_name 
            FROM reports r 
            JOIN users u ON r.user_id = u.id 
            WHERE r.tenant_id = ? 
            AND r.captured_at >= ? 
            AND r.captured_at <= ? 
            ORDER BY r.captured_at DESC
        ");
        
        $stmt->execute([$tenant_id, $start . ' 00:00:00', $end . ' 23:59:59']);
        echo json_encode($stmt->fetchAll());
        
    } catch (Exception $e) {
        http_response_code(500); 
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
}
?>