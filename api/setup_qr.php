<?php
// api/setup_qr.php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }
require_once 'db.php';
ini_set('display_errors', 0);

try {
    $data = json_decode(file_get_contents("php://input"));
    if (!$data || empty($data->uuid) || empty($data->lat) || empty($data->lng)) {
        throw new Exception("Datos GPS incompletos.");
    }

    // Actualizamos las coordenadas del código QR escaneado
    $stmt = $pdo->prepare("UPDATE checkpoints SET expected_lat = :lat, expected_lng = :lng WHERE uuid = :uuid");
    $stmt->execute([':lat' => $data->lat, ':lng' => $data->lng, ':uuid' => $data->uuid]);

    if ($stmt->rowCount() > 0) {
        echo json_encode(['status' => 'success', 'message' => 'Ubicación de QR registrada con éxito.']);
    } else {
        throw new Exception("El QR no existe o ya tenía estas mismas coordenadas.");
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}
?>