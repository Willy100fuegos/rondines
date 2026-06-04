<?php
// api/sync.php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }
require_once 'db.php';
ini_set('display_errors', 0);

$raw_data = file_get_contents("php://input");
$data = json_decode($raw_data, true);

$rounds = [];
if (isset($data['rounds'])) {
    $rounds = $data['rounds'];
} elseif (is_array($data) && !empty($data)) {
    $rounds = $data;
}

if (empty($rounds)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Datos incompletos. Estructura no reconocida.']);
    exit;
}

function cleanDate($dateStr) {
    if (empty($dateStr)) return null;
    $time = strtotime($dateStr);
    return $time ? date('Y-m-d H:i:s', $time) : null;
}

try {
    $pdo->beginTransaction();

    $stmtRound = $pdo->prepare("INSERT INTO rounds (tenant_id, user_id, round_id, shift, start_time, end_time, status) VALUES (:tenant_id, :user_id, :round_id, :shift, :start_time, :end_time, 'completed')");
    
    $stmtScan = $pdo->prepare("INSERT INTO scans (tenant_id, user_id, round_id, shift, checkpoint_id, checkpoint_uuid, uuid, checkpoint_name, captured_at, gps_lat, gps_lng, distance_m, is_geofence_valid) VALUES (:tenant_id, :user_id, :round_id, :shift, :checkpoint_id, :checkpoint_uuid, :uuid, :checkpoint_name, :captured_at, :gps_lat, :gps_lng, :distance_m, :is_geofence_valid)");

    $stmtFindCp = $pdo->prepare("SELECT id FROM checkpoints WHERE uuid = :uuid LIMIT 1");

    $insertedRounds = 0;

    foreach ($rounds as $r) {
        
        // FIX TI: Escudo contra memoria corrupta del celular
        $t_id = isset($r['tenant_id']) && $r['tenant_id'] !== '' ? $r['tenant_id'] : null;
        $u_id = isset($r['user_id']) && $r['user_id'] !== '' ? $r['user_id'] : null;

        // Si el paquete perdió la etiqueta de la empresa o usuario, es un paquete fantasma.
        // Lo ignoramos de forma segura para no colapsar la Base de Datos.
        if ($t_id === null || $u_id === null) {
            continue; 
        }

        $shiftVal = $r['shift'] ?? 'Diurno';
        $round_id_val = $r['round_id'] ?? 'RND-ERROR';
        
        $stmtRound->execute([
            ':tenant_id'  => $t_id,
            ':user_id'    => $u_id,
            ':round_id'   => $round_id_val,
            ':shift'      => $shiftVal,
            ':start_time' => cleanDate($r['start_time']),
            ':end_time'   => cleanDate($r['end_time'])
        ]);

        if (!empty($r['scans']) && is_array($r['scans'])) {
            foreach ($r['scans'] as $scan) {
                $lat = isset($scan['lat']) && is_numeric($scan['lat']) ? $scan['lat'] : 0;
                $lng = isset($scan['lng']) && is_numeric($scan['lng']) ? $scan['lng'] : 0;
                
                $distance_val = isset($scan['distance']) && is_numeric($scan['distance']) ? $scan['distance'] : 0;
                if ($distance_val > 999999.99) {
                    $distance_val = 999999.99;
                } elseif ($distance_val < 0) {
                    $distance_val = 0;
                }

                $uuid_val = $scan['uuid'] ?? 'UNKNOWN';
                
                $checkpoint_id = null;
                if ($uuid_val !== 'UNKNOWN') {
                    $stmtFindCp->execute([':uuid' => $uuid_val]);
                    $cpMatch = $stmtFindCp->fetch();
                    if ($cpMatch) {
                        $checkpoint_id = $cpMatch['id'];
                    }
                }
                
                $stmtScan->execute([
                    ':tenant_id'         => $t_id,
                    ':user_id'           => $u_id,
                    ':round_id'          => $round_id_val,
                    ':shift'             => $shiftVal,
                    ':checkpoint_id'     => $checkpoint_id, 
                    ':checkpoint_uuid'   => $uuid_val,      
                    ':uuid'              => $uuid_val,      
                    ':checkpoint_name'   => $scan['checkpointName'] ?? 'Desconocido',
                    ':captured_at'       => cleanDate($scan['timestamp']),
                    ':gps_lat'           => $lat,
                    ':gps_lng'           => $lng,
                    ':distance_m'        => $distance_val, 
                    ':is_geofence_valid' => empty($scan['isValid']) ? 0 : 1
                ]);
            }
        }
        $insertedRounds++;
    }

    $pdo->commit();
    echo json_encode(['status' => 'success', 'message' => "$insertedRounds rondines sincronizados."]);

} catch (Exception $e) {
    $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Error SQL: ' . $e->getMessage()]);
}
?>