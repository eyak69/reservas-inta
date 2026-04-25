# Learning Log - Reservas INTA

## [2026-04-24] Gestión de Procesos y Puertos en Desarrollo
- **Incidencia:** Error `EADDRINUSE: address already in use :::3000` detectado al intentar reiniciar el backend.
- **Causa:** Instancias de Node.js quedaron huérfanas o no se cerraron correctamente tras una sesión anterior.
- **Solución Aplicada:** Ejecución de `taskkill /F /IM node.exe` para limpiar el entorno.
- **Reflexión Arquitectónica:** 
    - Se debe priorizar la migración a un entorno de desarrollo dockerizado para garantizar la reproducibilidad y limpieza del estado (Regla 14).
    - El manejo de señales de terminación en `server.js` debe ser revisado para asegurar un "Graceful Shutdown" (Regla 11).

## [2026-04-24] Automatización de Esquema de Base de Datos
- **Cambio:** Integración de `runMigrations()` en el arranque del backend.
- **Motivo:** Asegurar que las tablas existan con los campos correctos (incluyendo `space_id` en logs) al desplegar en Coolify.
- **Tablas Creadas:**
    - `users`: Usuarios y autenticación. Se llena en el registro o primer login de Google.
    - `spaces`: Recursos reservables. Se llena con un seed inicial si está vacía.
    - `reservations`: Reservas de espacios. Se llena cuando un usuario reserva.
    - `activity_logs`: Auditoría. Incluye `space_id` para trazabilidad de qué espacio fue afectado. Se llena automáticamente en cada acción.
    - `chat_messages`: Historial de IA. Se llena durante las conversaciones con el bot.

## [2026-04-24] Resiliencia del Asistente IA (Chat)
- **Problema:** El widget del chat no era visible en entornos de producción (Coolify).
- **Causas Identificadas:**
    1.  **Contexto de Apilamiento:** El widget estaba fuera del contenedor principal (`#app-view`), lo que podía causar que capas con `z-index` alto lo ocultaran.
    2.  **Construcción Docker:** Existencia de un `Dockerfile` redundante en `backend/` que no incluía el frontend si se construía desde allí.
    3.  **Race Condition:** La inicialización del chat dependía de la carga secuencial del perfil del usuario, la cual es más lenta en entornos remotos.
- **Solución Aplicada:**
    - **Reubicación:** Se movió el `chat-widget` dentro del `#app-view`.
    - **Desacoplamiento:** Se añadió un `setTimeout` de 500ms en `auth.js` para inicializar el chat de forma asíncrona e independiente de la API de perfil.
    - **Fuerza Bruta CSS:** Se usa `.style.setProperty('display', 'block', 'important')` en JS para garantizar visibilidad.
    - **Limpieza Docker:** Se eliminó `backend/Dockerfile` para dejar el de la raíz como única fuente de verdad (Single Source of Truth).

## [2026-04-24] Estrategia de Puertos Desacoplados (Dev vs Prod)
- **Problema:** Conflictos constantes con el puerto 3000 en el entorno local del desarrollador.
- **Solución Aplicada:**
    - Se configuró el puerto por defecto en `server.js` como **3001** (`process.env.PORT || 3001`).
    - Se mantuvo la configuración de **Docker (Dockerfile y Compose)** en el puerto **3000**.
- **Resultado:** El desarrollador puede correr `npm run dev` localmente sin interferencias, mientras que el despliegue en producción sigue siendo transparente y compatible con la infraestructura existente de Coolify/Traefik.
