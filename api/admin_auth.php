<?php
// api/admin_auth.php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }
require_once 'db.php';
ini_set('display_errors', 0);

$action = $_GET['action'] ?? 'login';
$data = json_decode(file_get_contents("php://input"));

if ($action === 'create') {
    if (empty($data->username) || empty($data->password) || empty($data->tenant_id)) {
        http_response_code(400); 
        echo json_encode(['status' => 'error', 'message' => 'Datos incompletos para crear usuario.']); 
        exit;
    }
    try {
        $stmt = $pdo->prepare("INSERT INTO web_users (username, password_hash, role, tenant_id) VALUES (:username, SHA2(:password, 256), 'client', :tenant_id)");
        $stmt->execute([
            ':username' => $data->username,
            ':password' => $data->password,
            ':tenant_id' => $data->tenant_id
        ]);
        echo json_encode(['status' => 'success', 'message' => 'Usuario cliente creado exitosamente.']);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Error al crear usuario. Posible nombre duplicado.']);
    }
    exit;
}

if (empty($data) || empty($data->username) || empty($data->password)) {
    http_response_code(400); 
    echo json_encode(['status' => 'error', 'message' => 'Credenciales incompletas.']); 
    exit;
}

try {
    // AÑADIDO: Ahora también seleccionamos el 'corporate_id'
    $stmt = $pdo->prepare("SELECT id, username, role, tenant_id, corporate_id FROM web_users WHERE username = :username AND password_hash = SHA2(:password, 256) LIMIT 1");
    $stmt->execute([':username' => $data->username, ':password' => $data->password]);
    $user = $stmt->fetch();

    if ($user) {
        echo json_encode(['status' => 'success', 'user' => $user]);
    } else {
        http_response_code(401);
        echo json_encode(['status' => 'error', 'message' => 'Usuario o contraseña incorrectos.']);
    }
} catch (Exception $e) {
    http_response_code(500); 
    echo json_encode(['status' => 'error', 'message' => 'Error de conexión con el servidor.']);
}
?>