<?php
// api/auth.php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }
require_once 'db.php';
ini_set('display_errors', 0);

$data = json_decode(file_get_contents("php://input"));
if (empty($data) || !isset($data->pin)) {
    http_response_code(400); echo json_encode(['status' => 'error', 'message' => 'PIN no proporcionado.']); exit;
}

try {
    $stmt = $pdo->prepare("
        SELECT u.id as user_id, u.name as guard_name, u.tenant_id, t.name as tenant_name, u.can_setup 
        FROM users u JOIN tenants t ON u.tenant_id = t.id 
        WHERE u.pin_code = :pin AND u.is_active = 1 LIMIT 1
    ");
    $stmt->execute([':pin' => $data->pin]);
    $user = $stmt->fetch();

    if ($user) echo json_encode(['status' => 'success', 'user' => $user]);
    else { http_response_code(401); echo json_encode(['status' => 'error', 'message' => 'PIN incorrecto o inactivo.']); }
} catch (Exception $e) {
    http_response_code(500); echo json_encode(['status' => 'error', 'message' => 'Error de servidor.']);
}
?>