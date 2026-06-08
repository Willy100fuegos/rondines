Arquitectura y Contexto del Sistema: Plataforma de Rondines (Goratrack)

Este documento define la arquitectura, el stack tecnológico, el modelo de datos y las reglas de negocio críticas de la plataforma "Rondines". Debe ser utilizado como fuente de verdad para cualquier refactorización, depuración o desarrollo de nuevas características.

1. Visión General de la Arquitectura

El sistema opera bajo una arquitectura Híbrida (Local-First + Cloud Sync). Está compuesto por una aplicación móvil progresiva (PWA) orientada a la operación en campo (Edge Computing) y un panel administrativo web (Dashboard) para monitoreo centralizado.

👉 Frontend Stack: HTML5 puro, Alpine.js (reactividad y estado), Tailwind CSS (estilos utilitarios vía CDN). No hay un proceso de build (Node/Webpack); todo se ejecuta directamente en el navegador.

👉 Backend Stack: PHP 7/8 puro (Arquitectura de microservicios RESTful básicos). No se utiliza Laravel ni frameworks pesados.

👉 Database: MySQL (Relacional) utilizando la capa de abstracción PDO para prevención de inyecciones SQL.

👉 Librerías Clave: html5-qrcode (escaneo), Leaflet.js (mapas), Chart.js (analíticas).

2. Topología del Frontend

La interfaz de usuario está estrictamente dividida en dos aplicaciones independientes:

✓ index.html (App Móvil / PWA):

Utilizada exclusivamente por los guardias de seguridad en teléfonos móviles.

Estado (Alpine.js): Maneja un estado complejo (rondinApp) que controla la sesión actual, la ronda activa (activeRound), colas de sincronización (syncQueue, reportQueue) y caché del historial (guardHistory).

Offline-First: Almacena todos los datos operativos en localStorage (ej. gora_active_round, gora_sync_queue).

Características del Hardware: Integra acceso a la cámara (QR), API de Geolocalización continua, y compresión de imágenes en el cliente mediante el uso de <canvas> antes de enviar a la API.

✓ admin.html (Dashboard Corporativo):

Utilizado por administradores y clientes (superadmin y client).

Estado (Alpine.js): Manejado a través de adminDashboard(). Controla la navegación por pestañas (currentTab), renderizado condicional de mapas de calor, gráficas de cumplimiento y auditoría en tiempo real.

Selector Corporativo: Implementa lógica para agrupar múltiples locaciones (tenants) bajo un solo conglomerado (corporate_id).

3. Estructura del Backend (API PHP)

El directorio api/ contiene los controladores que procesan las peticiones HTTP (GET, POST, DELETE). Todos retornan cabeceras application/json.

👉 db.php: Archivo núcleo. Contiene la instanciación de PDO ($pdo). Todas las demás APIs hacen un require_once de este archivo.

👉 auth.php: Autenticación para Guardias (basada en un PIN de 4 a 6 dígitos). Retorna información de la sesión y el tenant_id.

👉 admin_auth.php: Autenticación para usuarios web (Dashboard). Soporta encriptación SHA2(256) y diferencia roles (superadmin, client) y niveles de acceso (tenant_id individual vs corporate_id global).

👉 sync.php: El endpoint más crítico. Recibe el payload de la App Móvil (Rondines y Escaneos). Implementa escudos de integridad (ej. reemplazo de GPS nulos por 0, recorte preventivo de distancias absurdamente altas por encima de 999999.99 para evitar SQL Overflows, y descarte de "paquetes fantasma" sin tenant_id).

👉 reports.php: Maneja la recepción y consulta de incidentes. Guarda cadenas Base64 como archivos físicos de imagen y almacena las rutas en BD.

👉 history.php: Devuelve los últimos 15 rondines válidos de un guardia. Utiliza cláusulas EXISTS en SQL para omitir rondines que no contengan escaneos físicos.

👉 admin.php: Controlador multipropósito para el panel. Procesa consultas CRUD (Crear Puntos QR, Listar Guardias, Eliminar Empresas) y provee los datos para las métricas de analítica de la plataforma.

👉 setup_qr.php: Endpoint para el autodescubrimiento GPS. Cuando se escanea un QR "virgen" por primera vez, este archivo asienta sus coordenadas definitivas en la BD.

4. Modelo de Datos Principal (MySQL)

El sistema opera bajo un esquema Multi-Tenant (Multi-Inquilino). Cada registro operativo está sellado con un tenant_id para garantizar la segregación de datos.

corporates: Agrupaciones empresariales de nivel superior (ej. Braskem IDESA).

tenants: Locaciones o empresas individuales (ej. Planta Coatzacoalcos, Oficinas CDMX). Se vinculan opcionalmente a un corporate_id.

web_users: Usuarios del panel web (Role: superadmin o client).

users (Guardias): Personal de seguridad. Vinculados estrictamente a un tenant_id.

checkpoints: Etiquetas físicas QR. Tienen un nombre, un uuid (cadena única inmutable), coordenadas esperadas (expected_lat, expected_lng) y tolerancia en metros (radius_tolerance).

rounds: Registros de cabecera de una patrulla. Contiene hora de inicio, hora de fin, turno (shift) y estatus.

scans: El registro atómico de la operación. Vinculado a un round_id. Guarda las coordenadas exactas de la lectura (gps_lat, gps_lng), calcula la distancia (distance_m) y arroja una bandera de validación (is_geofence_valid).

reports: Bitácora de incidentes. Guarda descripciones y rutas de fotografías (photo_1, photo_2, etc.).

5. Reglas de Negocio Estrictas (No Alterar)

⚠️ Advertencia para el Asistente IA: Al sugerir modificaciones de código, respeta inquebrantablemente las siguientes reglas operativas:

Regla de Rondines Vacíos (Zero-Scan Rule): Un rondín (round) que se inicia y se termina sin haber escaneado ni un solo código QR (scans.length === 0) es considerado un falso positivo. La aplicación móvil (frontend) lo descarta y destruye localmente. NO DEBE sincronizarse al servidor.

Degradación Elegante del GPS (GPS Fallback): Si el dispositivo del guardia falla al obtener latitud/longitud, la app no bloquea la operación. Envía el escaneo o reporte. El backend (sync.php) debe interceptar coordenadas nulas y convertirlas en 0 para salvaguardar la integridad de la base de datos (Columnas NOT NULL).

Límites Numéricos (Overflow Protection): La columna distance_m es DECIMAL(10,2). Cualquier cálculo de distancia entre el dispositivo y el punto QR que exceda 999999.99 metros debe truncarse en el backend a ese límite máximo para evitar un crash SQLSTATE[22003].

Trazabilidad Híbrida (uuid vs checkpoint_id): Para mantener retrocompatibilidad con las consultas antiguas del panel web, cuando el backend (sync.php) recibe un escaneo, utiliza el uuid alfanumérico que envió la app para buscar silenciosamente el id numérico (checkpoint_id) en la tabla checkpoints e insertarlo junto con los demás datos.

Doble Cola de Sincronización (Offline-First Manual Sync): La app móvil maneja syncQueue (para rondines) y reportQueue (para incidentes). Los datos siempre se guardan primero en localStorage. NO se sincroniza automáticamente al detectar señal. El guardia activa manualmente la subida presionando el botón "Subir Ahora" cuando sabe que tiene conectividad. La función syncAllPending() itera registro por registro: si un fetch falla, ese registro permanece en la cola y se muestra "Reintento fallido, intente más tarde".

6. Integración del Service Worker (PWA)

El archivo sw.js (y manifest.json) se encarga de servir la aplicación móvil en áreas sin cobertura (sótanos industriales). Cualquier actualización al index.html requiere una invalidación explícita de la caché mediante el botón "Forzar Actualización de App", el cual ha sido programado específicamente para limpiar las memorias temporales preservando las llaves con prefijo gora_history_, gora_sync_ y gora_report_.