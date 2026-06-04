# Rondines / Goratrack

## 📖 Descripción del proyecto

**Rondines** es una solución integral de control de rondas para la empresa de seguridad privada **SESCA**. Está diseñada para que los rondineros (guardias de vigilancia) registren sus inspecciones mediante códigos QR y para que el área operativa y los clientes revisen la información en tiempo real.

- **WebApp móvil**: Se abre en teléfonos o tablets y permite al rondinero iniciar sesión con un código asignado a su servicio.
- **Panel administrativo**: Aplicación web para supervisores, clientes y super‑administradores que muestra reportes, auditorías, mapas de puntos de control y gestión de usuarios.

## 🚀 Funcionalidades principales

| Funcionalidad | Descripción | Imagen |
|---|---|---|
| **Aplicación móvil** | El rondinero accede mediante un código vinculado a su servicio asignado. | ![Mobile App](http://imgfz.com/i/XBzifbO.png) |
| **Reportes con fotos** | Los guardias pueden enviar fotografías, descripción y categoría de hallazgos; estos se almacenan para revisión operativa o del cliente. | ![Reportes](http://imgfz.com/i/MxBisyU.png) |
| **Auditoría de fichajes** | Cada escaneo del QR queda registrado con hora y ubicación, garantizando trazabilidad. | ![Auditoría](http://imgfz.com/i/y0UWjmZ.png) |
| **Puntos de control** | Mapa interactivo que muestra la ubicación y el nombre de cada QR instalado. | ![Puntos de control](http://imgfz.com/i/wtFr1x5.png) |
| **Gestión de rondineros** | Se pueden registrar y administrar tantos rondineros como sea necesario. | ![Gestión de rondineros](http://imgfz.com/i/cokYL3S.png) |

## 🛠 Tecnologías usadas

- **Frontend**: HTML5, Alpine.js, Tailwind CSS (CDN), Chart.js, Leaflet.js.
- **Backend**: PHP puro (sin frameworks) y MySQL.
- **PWA**: Service Worker (`sw.js`) y manifest para uso offline.

## 📦 Instalación rápida

1. **Clonar el repositorio**
   ```bash
   git clone https://github.com/Willy100fuegos/rondines.git
   cd rondines
   ```
2. **Configurar la base de datos**
   - Copia `api/db.example.php` a `api/db.php` y rellena los valores reales de conexión MySQL.
3. **Crear la base de datos**
   ```sql
   source database/schema.sql;
   ```
4. **Servir la aplicación**
   - Puedes usar cualquier servidor PHP (XAMPP, MAMP, LAMP) apuntando la raíz al directorio `rondines`.
   - Asegúrate de que el directorio `uploads/` sea escribible por el servidor web.
5. **Acceder**
   - WebApp móvil: abre `admin.html` en un dispositivo móvil.
   - Panel administrativo: abre `admin.html` en un navegador de escritorio y autentícate con las credenciales de SESCA.

## ⚙️ Configuración adicional

- **Variables de entorno**: Puedes usar un archivo `.env` para almacenar parámetros sensibles (no se versiona gracias al `.gitignore`).
- **HTTPS**: Para producción, habilita HTTPS y configura CORS según sea necesario.
- **Service Worker**: Recarga la página con `Ctrl+F5` o utiliza el botón "Forzar Actualización de App" para invalidar la caché.

## 📚 Documentación interna

Revisa `context.md` para conocer la arquitectura, modelo de datos y reglas de negocio estrictas del sistema.

---

*Este README está pensado como la cara pública del proyecto. Mantén actualizado el contenido y las imágenes a medida que evolucione la plataforma.*
