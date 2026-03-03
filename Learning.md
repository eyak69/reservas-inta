# Registro de Aprendizajes (Learning.md)

## 1. Diseño Avanzado en FullCalendar
Se aprendió que la mejor forma de enriquecer el texto dentro de los bloques de reserva del calendario es utilizando la función interna `eventContent`. Esto permite retornar un JSON con la propiedad `html`, inyectando clases de Tailwind, descripciones personalizadas e incluso iconos, superando las limitaciones impuestas por el uso rudimentario de la llave `title`.

## 2. Promesas y Modales de Confirmación JS
Se descubrió un error silencioso grave al crear un modal de confirmación (`showConfirm`) customizado anclado a una Promesa. Para prevenir la sobreexposición y ejecución repetida de eventos con `addEventListener`, la técnica de usar `cloneNode(true)` para borrar los eventos rompe el árbol DOM para futuras animaciones. La solución óptima es reescribir manualmente los manejadores a nulo (`btn.onclick = null`) para su correcta destitución de la memoria y control de flujo.

## 3. Seguridad de Middlewares (Bloqueo Instantáneo)
La protección pura basada en JWT puede causar vulnerabilidades si se da de baja a un usuario, pero no caduca su token del lado del cliente. La lección aprendida consiste en cruzar la decodificación del Token JWT con una sola consulta a la base de datos en el `authMiddleware` para verificar la propiedad `is_active`. Esto bloquea el acceso en tiempo real sin requerir una lista negra de Tokens.

## 4. Captchas Propios (Sin Google reCAPTCHA)
Para independizar el sistema del cliente frente a validaciones externas (como Google Cloud o reCaptcha de terceros), se empleó la biblioteca nativa `svg-captcha` para Node.js, donde generamos dinámicamente gráficos vectoriales (ruido, líneas de distracción) emitidos junto con un token JWT del texto esperado. De forma rápida y sin configuraciones adicionales se blindó la ruta contra comportamientos autogenerados y spam.

## 5. Unificación de Servicios en Docker
La mejor práctica para despliegues ligeros es servir el Frontend (archivos estáticos) directamente a través del Backend (Express), eliminando la necesidad de un servidor web adicional como Nginx para aplicaciones pequeñas. Esto simplifica la gestión de puertos y redes en Docker, permitiendo usar un único `Dockerfile` y un `docker-compose.yml` que orqueste la App y la Base de Datos con volúmenes persistentes (`/var/lib/mysql`) para asegurar que la información no se pierda al reiniciar el sistema.

## 6. Automatización de Construcción Docker (.bat)
Para agilizar el flujo de despliegue, es una excelente práctica contar con scripts de automatización (como `.bat` en Windows) que realicen el ciclo completo de: cambio de directorio a la raíz (`cd /d "%~dp0.."`), login en el registro, construcción multiplataforma (`--platform linux/amd64`) y subida (`push`) a registros como Docker Hub. Esto asegura que las imágenes sean consistentes y reduce errores manuales en los comandos.

## 7. Modales fuera del contenedor de vista activa
Los modales de alerta, confirmación y notificaciones (toast) deben estar al nivel del `<body>`, **fuera de cualquier div de vista** (`app-view`, `auth-view`), para que sean visibles independientemente de qué pantalla esté activa. Si están dentro de un div con `display:none` o `hidden`, el CSS de posicionamiento `fixed` no los muestra aunque se les quite el `hidden`.

## 8. Verificación del token JWT contra la base de datos al cargar
El `checkAuth()` del frontend no debe confiar ciegamente en el token de `localStorage`. Lo correcto es llamar a `/api/users/profile` al iniciar para verificar que el usuario sigue existiendo y activo en la DB. Si el backend responde 401/403, se hace logout automático. Evita que usuarios eliminados o deshabilitados sigan navegando.

## 9. Flujo de registro con aprobación de admin
Para sistemas con control de acceso, el registro (email y Google OAuth) debe crear el usuario con `is_active = false` y **no emitir token JWT**. El backend devuelve `HTTP 202` con `{ pending: true }`. El frontend detecta esto y muestra una pantalla de espera informativa en lugar de dejar entrar al usuario.

## 10. Cambio de rol sin auto-modificación
Al implementar cambio de roles (usuario ↔ admin), proteger el endpoint en el backend comparando `req.user.id` con el `id` del parámetro, y en el frontend ocultando los botones para el usuario logueado. Esto evita que un admin se quite accidentalmente su propio rol.

## 11. Seguridad y Blindaje en APIs Node.js/Express
Resulta esencial proteger las APIs que manejan autenticación e información sensible:
*   **Ataques de Fuerza Bruta:** Usar librerías como `express-rate-limit` para bloquear IPs que superen un umbral de intentos rápidos en el login.
*   **Ataques Stored XSS:** No confiar nunca en `innerHTML` en el frontend si los datos vienen de la base de datos sin sanitizar. Una estrategia robusta backend es usar un middleware que itere limpiar recursivamente `req.body`, `req.query` y `req.params` (con librerías probadas como `xss`).
*   **Information Leakage (Cabeceras HTTP):** Instalar `helmet` configura automáticamente decenas de cabeceras seguras (HSTS, NoSniff, etc.) y oculta firmas tecnológicas (ej. `X-Powered-By: Express`). Si la app carga JS desde CDNs (Google, etc.), se puede configurar `contentSecurityPolicy: false` para no romper el frontend.
