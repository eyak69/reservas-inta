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

## 12. Seguridad en Formularios: Visibilidad y Doble Validación de Clave
Al implementar funciones de "mostrar contraseña" (el clásico "ojito") en sistemas corporativos, existe el riesgo a largo plazo del "Shoulder Surfing" (alguien mirando por la espalda). Aunque mejora la experiencia de usuario, es prudente considerar mitigar el riesgo ocultando la clave tras unos segundos.
A su vez, la doble validación de contraseña ("Repetir clave") no debe limitarse al Frontend; una llamada directa a la API (ej. Postman) podría enviar claves mal escritas al servidor si no se cotejan ambas en el Backend.

## 13. Persistencia Integral en Docker
Considerando la regla de "Persistencia Blindada", cualquier archivo que modifique o genere la aplicación dentro del contenedor perece cuando este es destruido. Esto también aplica a los **logs** emitidos por el servidor y el Proxy inverso. Para no perder la traza de eventos ante crasheos, se requiere mapear un volumen como `./logs:/var/log/app`.

## 14. [CRÍTICO] Sincronización de Zona Horaria en Producción (Node + MySQL)
**Error detectado:** Las reservas se guardaban y leían con un desfase de múltiples horas en Producción.
**Lección Aprendida:** Jamás depender del Timezone implícito del servidor o permitir que el driver MySQL asuma UTC (`Z`) en aplicaciones que dependen de una zona horaria estricta local (como un sistema de reservas en una franja horaria acotada, ej. Mendoza `-03:00`). 
La falla ocurrió porque Node.js, actuando como cliente de MySQL, procesaba la fecha `DATETIME` devuelta como UTC estándar, forzando una doble re-conversión en el frontend y modificando visualmente el turno reservado, provocando reinicios o reinstalaciones completas en el entorno productivo. 
**Solución Arquitectónica:** Aislar el comportamiento de los clientes y la base de datos inyectando explícitamente el offset en la conexión del Pool de Base de Datos (en `db.js`), forzando `timezone: '-03:00'` y utilizando `dateStrings: true` para que los paquetes se transfieran textualmente y blindar el sistema contra dependencias infraestructurales fuera de nuestro control.

## 15. Seguridad XSS en "Tickets" o Vistas Renderizadas en el Cliente
Es una excelente mejora de UX mostrar a un usuario un detalle o "ticket virtual" confirmando todo lo que ha cargado en un formulario antes de enviarlo al servidor (`submit`).
Sin embargo, **si los datos ingresados por el usuario se inyectan en componentes visuales usando `innerHTML`**, se abre un grave agujero de seguridad conocido como Reflected/DOM-based XSS local.
Para evitar la auto-ejecución de scripts (ej. `<script>alert('hack')</script>`) capturados desde un campo de comentarios, la Regla Mínima de Oro es pasar toda variable tipo *string* del usuario por una función de sanitización (`escapeHTML`) que convierta los caracteres rompedores (`<`, `>`, `&`, `"`, `'`) en entidades HTML benignas preventivamente.

## 16. Arquitectura de Auditoría: Backend-Driven vs Frontend-Driven
La tabla que más rápido crece en cualquier sistema es la de Logs de Actividad. Si confiamos en que el Frontend inserte los logs llamando a un endpoint público (`POST /api/logs`), abrimos una grave vulnerabilidad de denegación de servicio (DDoS de almacenamiento), donde un atacante podría agotar el disco de la base de datos llamando millones de veces al endpoint.
**Principio de Auditoría Segura (Backend-Driven):** Los logs deben ser siempre automáticos, invisibles e infalsificables, creados puramente desde el servidor (Controladores) interceptando las acciones exitosas de los usuarios. Además, para prevenir colapsos en las vistas de monitoreo, se debe indexar correctamente la tabla en MySQL `(created_at, user_id)` e imponer estrictos límites de lectura (`LIMIT 200`) en la interfaz de administración.## 17. Recuperación de Contraseña Segura (Flujo Manual + SHA256)
Para evitar la dependencia de servicios SMTP (que pueden fallar o requerir costos) y prevenir la enumeración de usuarios, se optó por un flujo de recuperación mediado por el Administrador. 
*   **Seguridad de Tokens:** Los tokens de recuperación poseen alta entropía (32 bytes aleatorios) y se almacenan en la base de datos utilizando **SHA256**. A diferencia de `bcrypt`, SHA256 es determinístico, lo que permite al backend encontrar instantáneamente al usuario asociado al token sin comprometer la seguridad (ya que el token original nunca vive en la DB).
*   **Control Temporal:** Se impone una expiración estricta de 24 horas y el token se invalida (se limpia el campo) inmediatamente después del primer uso exitoso, siguiendo el principio de "One-Time-Token".


## 19. Gestión de Colisiones de Modales (Race Conditions en UI)
En interfaces Single Page Application (SPA) que reutilizan el mismo contenedor de overlay, abrir un modal inmediatamente después de cerrar otro provoca que el código de limpieza del primero destruya el contenido del segundo. La solución técnica consiste en implementar un rastreador de *timeouts* global (`confirmCleanupTimeout`) que permita cancelar limpiezas pendientes (`clearTimeout`) si se detecta una nueva apertura de modal, garantizando la persistencia del DOM para el nuevo contenido.

## 20. Sincronía de Lectura vs. Animaciones CSS
Al usar animaciones de salida (ej. 300ms de transición), es vital que la lógica de negocio resuelva la Promesa del modal **antes** de que la animación de limpieza borre el HTML inyectado. Si la Promesa se resuelve *después* del cierre visual, el código llamador intentará leer valores de `inputs` que ya han sido eliminados del árbol de elementos, resultando en fallos silenciosos y pérdida de datos a pesar de que el usuario los haya escrito correctamente.

## 21. Blindaje de Infraestructura para Producción (Docker)
Al desplegar en entornos administrados (como Coolify), es vital que la imagen Docker sea autónoma pero flexible. La lección aprendida es forzar la variable `TZ=America/Argentina/Buenos_Aires` a nivel de contenedor para que tanto Node como los logs de auditoría tengan coherencia horaria, independientemente de dónde esté físicamente el servidor. Además, el `Dockerfile` debe asegurar la existencia de directorios de persistencia (`logs`, `storage`) con permisos adecuados (`chmod 777`) para evitar fallos de escritura en el primer arranque.

## 22. Confianza en el Proxy Inverso (Trust Proxy)
Cuando una aplicación Node corre detrás de un Balanceador de Carga o Proxy (Traefik, Nginx), la propiedad `req.ip` devolverá la IP interna del proxy en lugar de la del usuario. Para que nuestro sistema de Auditoría/Logs sea veraz, es obligatorio configurar `app.set('trust proxy', 1)`. Esto permite que Express lea las cabeceras `X-Forwarded-For` y registre la IP real del cliente, blindando la trazabilidad de seguridad.

## 23. Google Sign-In, ES6 Modules y Políticas COOP
Al implementar Google Sign-In (GSI) con la API HTML (`g_id_onload`) dentro de una arquitectura Frontend basada en ES6 Modules (`type="module"`), existe una condición de carrera (Race Condition) donde el script asíncrono de Google busca en el objeto global `window.handleCredentialResponse` antes de que el módulo principal JS haya terminado de inyectarlo. Esto arroja el error de "callback no es una función".
*   **Solución Arquitectónica:** Inyectar un script inline crudo en el `index.html` justo antes del div de Google que defina un "placeholder" de la función en `window`. Este placeholder delega en el módulo real (`window._actualCredentialResponse`) si ya cargó, o reintenta con un pequeño retraso (500ms).
*   **Políticas Cross-Origin (COOP):** Al configurar `helmet` en el backend Node, el navegador asume mayor restricción sobre los popups al no existir cabeceras que los aprueben explícitamente. Es crucial pasar explícitamente `crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }` para evitar el bloqueo del `window.postMessage` que finaliza el flujo de inicio de sesión con Google.

## 24. Migración Definitiva de Google OAuth y Race Conditions de Rendering
Al abandonar bibliotecas client-side vulnerables a bloqueos de popups o navegadores de terceros (Safari/Brave), la migración a un flujo **Backend-Driven (Authorization Code Flow)** con redirecciones asegura una compatibilidad del 100%.
**Problema Detectado (Black Screen):** Al redirigir del backend al frontend devolviendo únicamente el token JWT (`#token=...`), el flujo del frontend (`checkAuth`) asumía que el perfil del usuario ya existía en el contexto asíncrono. Como los datos (nombre, rol) llegaban vacíos, el intento de renderizar el "Dashboard" (`user.name.split()`) fallaba de manera **silenciosa**, dejando el DOM vacío (pantalla negra) sin emitir alertas en consola.
**Solución Arquitectónica:** En implementaciones donde la sesión depende de un token inyectado por URL, el ciclo de vida de montaje de la interfaz debe pausarse forzosamente (`await`) para consumir el endpoint `/users/profile`. Sólo después de nutrir el `localStorage` con los datos validados desde el servidor, se puede habilitar el cambio de vista (CSS `display: flex`) hacia la aplicación y lanzar las funciones de renderizado.
