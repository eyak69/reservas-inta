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

## [2026-04-25] Modernización y Blindaje del Asistente IA
- **Cambio:** Refactorización total de la lógica de prompts y persistencia del chat.
- **Arquitectura de Prompts (Regla 12):** Se desacoplaron las guías de negocio y personalidad en `backend/config/chatPrompts.js`. El controlador ahora solo inyecta contexto dinámico.
- **Resiliencia de Memoria (Regla 4):** Las sesiones de chat ahora se "rehidratan" desde la base de datos (`chat_messages`) si no existen en RAM. Esto garantiza que el asistente no pierda el contexto tras reinicios del servidor o despliegues.
- **Aprendizaje Adaptativo (Regla 7):** Se integró el sistema de *Few-Shot Dinámico*. El asistente consulta sus interacciones más exitosas en la DB para guiar su comportamiento actual.
- **Seguridad y Robustez (Regla 10 y 11):**
    - Se implementó sanitización de inputs para prevenir XSS e inyecciones de prompt.
    - Se blindó `executeTool` para manejar argumentos nulos (hotfix por error detectado con Llama-3 en herramientas sin parámetros).
- **Lección Aprendida:** Los modelos de lenguaje pequeños o via APIs de terceros (Groq) a veces omiten el objeto de argumentos en herramientas de tipo "void". La normalización de parámetros en el dispatcher es obligatoria para evitar crashes de Node.
## 🎓 Lecciones del Test Profundo (Abril 2026)

### 1. Incompatibilidad de Tipos en Tool Calling (LLM vs Schema)
- **Error:** Los modelos (especialmente OpenAI) fallan con error 400 si un esquema dice `NUMBER` y el bot envía `"1"`.
- **Decisión:** Se cambiaron los IDs a `STRING` en las declaraciones de herramientas.
- **Blindaje:** `executeTool` ahora sanitiza y convierte a `Number` internamente. Esto hace al backend agnóstico a la imprecisión del LLM.

### 2. Poda de Contexto (Pruning) vs Rate Limits
- **Error:** Conversaciones largas con muchos resultados de herramientas superan el TPM (Tokens Per Minute) de los proveedores.
- **Decisión:** Implementada poda en `chatController.js`. Se reemplaza información de turnos antiguos (>4 pares) por un placeholder. Solo se mantiene el contexto fresco.

### 3. Interferencia Semántica (RAG Shadowing)
- **Error:** Los ejemplos recuperados de Qdrant pueden "envenenar" el razonamiento si no son 100% relevantes. El bot intentaba cancelar antes de reservar porque recordó un test anterior.
- **Decisión:** Aumentado `score_threshold` a 0.90 y encapsulado de ejemplos en tags `<ejemplo_de_aprendizaje>` para separar hechos de referencias de estilo.

### 4. Cadena de Fallback Indestructible
- **Error:** El sistema quedaba "ciego" si Groq o Gemini fallaban por saturación.
- **Decisión:** Se movió OpenAI (gpt-4o-mini) al principio del fallback estático. Es el "ancla de estabilidad" del sistema.
