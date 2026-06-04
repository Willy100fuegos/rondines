<?php
// api/history.php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, OPTIONS");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }
require_once 'db.php';
ini_set('display_errors', 0);

$user_id = $_GET['user_id'] ?? 0;

if ($user_id) {
    try {
        // FILTRO ESTRICTO: Utilizamos EXISTS para descartar de raíz cualquier rondín sin escaneos
        $stmt = $pdo->prepare("
            SELECT 
                r.id as db_id,
                (SELECT round_id FROM scans s WHERE s.captured_at >= r.start_time AND (r.end_time IS NULL OR s.captured_at <= r.end_time) LIMIT 1) as round_id,
                r.start_time, 
                r.end_time 
            FROM rounds r 
            WHERE r.user_id = :user_id 
            AND r.status = 'completed' 
            AND EXISTS (
                SELECT 1 FROM scans s 
                WHERE s.captured_at >= r.start_time 
                AND (r.end_time IS NULL OR s.captured_at <= r.end_time)
            )
            ORDER BY r.start_time DESC 
            LIMIT 15
        ");
        
        $stmt->execute([':user_id' => $user_id]);
        $history = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Blindaje residual por seguridad de interfaz
        foreach($history as &$h) {
            if (empty($h['round_id'])) {
                $h['round_id'] = 'Turno RND-' . $h['db_id'];
            }
        }
        
        echo json_encode($history);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
} else {
    echo json_encode([]);
}
?>