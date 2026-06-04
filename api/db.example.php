<?php
// api/db.php
// -------------------------------------------------------
// PLANTILLA — copia este archivo como "db.php" y rellena
// los valores reales. Nunca subas "db.php" al repositorio.
// -------------------------------------------------------

date_default_timezone_set('America/Mexico_City');

$host    = 'localhost';          // Host de MySQL
$db      = 'TU_BASE_DE_DATOS';  // Nombre de la base de datos
$user    = 'TU_USUARIO';        // Usuario de MySQL
$pass    = 'TU_CONTRASEÑA';     // Contraseña de MySQL
$charset = 'utf8mb4';

$dsn = "mysql:host=$host;dbname=$db;charset=$charset";

$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];

try {
    $pdo = new PDO($dsn, $user, $pass, $options);
} catch (\PDOException $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Error de conexión a la base de datos.']);
    exit;
}
?>
