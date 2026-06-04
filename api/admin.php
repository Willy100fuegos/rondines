<?php
// api/admin.php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

require_once 'db.php';
ini_set('display_errors', 0);
date_default_timezone_set('America/Mexico_City'); // Forzar CDMX

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$tenant_id = $_GET['tenant_id'] ?? 1;

try {
    if ($method === 'GET') {
        if ($action === 'services') {
            // Ordenamos alfabéticamente (A-Z) para que BRASKEM sea el primero por defecto
            $stmt = $pdo->query("SELECT * FROM tenants ORDER BY name ASC");
            echo json_encode($stmt->fetchAll());
        } elseif ($action === 'guards') {
            $stmt = $pdo->prepare("SELECT * FROM users WHERE tenant_id = ? ORDER BY id DESC");
            $stmt->execute([$tenant_id]);
            echo json_encode($stmt->fetchAll());
        } elseif ($action === 'audits') {
            $stmt = $pdo->prepare("SELECT s.* FROM scans s LEFT JOIN checkpoints c ON s.checkpoint_uuid = c.uuid WHERE c.tenant_id = ? ORDER BY s.captured_at DESC LIMIT 200");
            $stmt->execute([$tenant_id]);
            echo json_encode($stmt->fetchAll());
        } elseif ($action === 'analytics') {
            $start = $_GET['start'] ?? date('Y-m-d');
            $end = $_GET['end'] ?? date('Y-m-d');
            
            // SE AÑADIÓ s.round_id PARA CONTABILIZAR RONDINES ÚNICOS
            $stmt = $pdo->prepare("
                SELECT s.id, s.captured_at, s.shift, c.name as checkpoint_name, s.round_id 
                FROM scans s 
                LEFT JOIN checkpoints c ON s.checkpoint_uuid = c.uuid 
                WHERE c.tenant_id = ? 
                AND s.captured_at >= ? 
                AND s.captured_at <= ? 
                ORDER BY s.captured_at ASC
            ");
            $stmt->execute([$tenant_id, $start . ' 00:00:00', $end . ' 23:59:59']);
            echo json_encode($stmt->fetchAll());
        } else {
            $stmt = $pdo->prepare("SELECT * FROM checkpoints WHERE tenant_id = ? ORDER BY id DESC");
            $stmt->execute([$tenant_id]);
            echo json_encode($stmt->fetchAll());
        }
    } 
    elseif ($method === 'POST') {
        $data = json_decode(file_get_contents("php://input"));
        if (!$data) throw new Exception("Datos vacíos o formato incorrecto.");
        
        if ($action === 'services') {
            if (empty($data->name)) throw new Exception("El nombre del servicio es obligatorio.");
            $stmt = $pdo->prepare("INSERT INTO tenants (name) VALUES (:name)");
            $stmt->execute([':name' => $data->name]);
            echo json_encode(['status' => 'success']);
        } elseif ($action === 'guards') {
            if (empty($data->tenant_id) || empty($data->name) || empty($data->pin)) throw new Exception("Faltan datos requeridos.");
            $can_setup = isset($data->can_setup) && $data->can_setup ? 1 : 0;
            $stmt = $pdo->prepare("INSERT INTO users (tenant_id, name, pin_code, can_setup) VALUES (:tenant_id, :name, :pin, :can_setup)");
            $stmt->execute([':tenant_id' => $data->tenant_id, ':name' => $data->name, ':pin' => $data->pin, ':can_setup' => $can_setup]);
            echo json_encode(['status' => 'success']);
        } elseif ($action === 'toggle_setup') {
            if (empty($data->id)) throw new Exception("ID del guardia requerido.");
            $can_setup = isset($data->can_setup) && $data->can_setup ? 1 : 0;
            $stmt = $pdo->prepare("UPDATE users SET can_setup = :can_setup WHERE id = :id");
            $stmt->execute([':can_setup' => $can_setup, ':id' => $data->id]);
            echo json_encode(['status' => 'success']);
        } else {
            if (empty($data->tenant_id) || empty($data->uuid) || empty($data->name)) throw new Exception("Faltan datos clave.");
            $lat = !empty($data->lat) ? $data->lat : null;
            $lng = !empty($data->lng) ? $data->lng : null;
            
            $stmt = $pdo->prepare("INSERT INTO checkpoints (tenant_id, uuid, name, expected_lat, expected_lng, radius_tolerance) VALUES (:tenant_id, :uuid, :name, :lat, :lng, :tolerance)");
            $stmt->execute([':tenant_id' => $data->tenant_id, ':uuid' => $data->uuid, ':name' => $data->name, ':lat' => $lat, ':lng' => $lng, ':tolerance' => $data->tolerance]);
            echo json_encode(['status' => 'success']);
        }
    } 
    elseif ($method === 'DELETE') {
        $id = $_GET['id'] ?? 0;
        if (empty($id)) throw new Exception("ID no especificado.");
        
        $table = $action === 'services' ? 'tenants' : ($action === 'guards' ? 'users' : 'checkpoints');
        $stmt = $pdo->prepare("DELETE FROM {$table} WHERE id = ?");
        $stmt->execute([$id]);
        echo json_encode(['status' => 'success']);
    }
} catch (Exception $e) {
    http_response_code(500); echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}
?>