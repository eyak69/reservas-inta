# Learning Log - Reservas INTA

## [2026-04-24] GestiÃ³n de Procesos y Puertos en Desarrollo
- **Incidencia:** Error `EADDRINUSE: address already in use :::3000` detectado al intentar reiniciar el backend.
- **Causa:** Instancias de Node.js quedaron huÃ©rfanas o no se cerraron correctamente tras una sesiÃ³n anterior.
- **SoluciÃ³n Aplicada:** EjecuciÃ³n de `taskkill /F /IM node.exe` para limpiar el entorno.
- **ReflexiÃ³n ArquitectÃ³nica:** 
    - Se debe priorizar la migraciÃ³n a un entorno de desarrollo dockerizado para garantizar la reproducibilidad y limpieza del estado (Regla 14).
    - El manejo de seÃ±ales de terminaciÃ³n en `server.js` debe ser revisado para asegurar un "Graceful Shutdown" (Regla 11).

## [2026-04-25] Estabilización de Notificaciones y Responsividad

### Errores Detectados y Corregidos
1. **Charset Emojis (Regla 4):** La tabla `notifications` fallaba al insertar checkmarks (✅). Se forzó `utf8mb4` en la DB y en la conexión de Node (`db.js`).
2. **Resiliencia Telegram (Regla 11):** Errores de red (`ECONNRESET`) en la API de Telegram hacían que el proceso de notificación fallara. Se aisló en un `try/catch` para que la notificación web siga funcionando.
3. **Responsividad Móvil (Regla 7):** Los títulos de las salas desaparecían en pantallas pequeñas por colapso de Flexbox. Se aplicó `min-w-0` y se ajustaron los paddings dinámicamente.
4. **Header Dinámico (Regla 1):** El nombre del usuario no aparecía en el header móvil. Se dinamizó la inyección de datos tras la autenticación.
5. **Race Condition Socket:** El socket intentaba autenticarse antes de que el JWT estuviera listo. Se movió la lógica de conexión al flujo `async` de inicio de la app.
6. **Persistencia Telegram (Regla 10):** El estado `telegram_linked` no se guardaba en `localStorage` tras el login, causando que en móviles apareciera como desvinculado. Se corrigió en `auth.js`.

### 🛠️ Identidad y Legado del Nombre
- **Origen de "Lidia":** El nombre representa un homenaje a **Lidia Esther**, la madre del programador principal.
- **Impacto Arquitectónico:** Esta definición rige el "Tone of Voice" (ToV) del sistema. Lidia debe actuar con la calidez de una madre y la eficiencia necesaria para resolver problemas, priorizando siempre la resolución sobre la respuesta técnica fría.

### Decisiones de Arquitectura (Regla 12)
- **Blindaje de Controladores:** Se agregó validación explícita de `req.user` en todos los endpoints de notificaciones para evitar errores 500 silenciosos.
- **Single Responsibility:** Se separó la lógica de Telegram de la lógica de base de datos para garantizar que un fallo en un canal no afecte al otro.
- **Developer Experience (Regla 14):** Se mejoraron los logs del servidor para facilitar el debugging en entornos Dockerizados como Coolify.

## [2026-04-24] AutomatizaciÃ³n de Esquema de Base de Datos
- **Cambio:** IntegraciÃ³n de `runMigrations()` en el arranque del backend.
- **Motivo:** Asegurar que las tablas existan con los campos correctos (incluyendo `space_id` en logs) al desplegar en Coolify.
- **Tablas Creadas:**
    - `users`: Usuarios y autenticaciÃ³n. Se llena en el registro o primer login de Google.
    - `spaces`: Recursos reservables. Se llena con un seed inicial si estÃ¡ vacÃ­a.
    - `reservations`: Reservas de espacios. Se llena cuando un usuario reserva.
    - `activity_logs`: AuditorÃ­a. Incluye `space_id` para trazabilidad de quÃ© espacio fue afectado. Se llena automÃ¡ticamente en cada acciÃ³n.
    - `chat_messages`: Historial de IA. Se llena durante las conversaciones con el bot.

## [2026-04-24] Resiliencia del Asistente IA (Chat)
- **Problema:** El widget del chat no era visible en entornos de producciÃ³n (Coolify).
- **Causas Identificadas:**
    1.  **Contexto de Apilamiento:** El widget estaba fuera del contenedor principal (`#app-view`), lo que podÃ­a causar que capas con `z-index` alto lo ocultaran.
    2.  **ConstrucciÃ³n Docker:** Existencia de un `Dockerfile` redundante en `backend/` que no incluÃ­a el frontend si se construÃ­a desde allÃ­.
    3.  **Race Condition:** La inicializaciÃ³n del chat dependÃ­a de la carga secuencial del perfil del usuario, la cual es mÃ¡s lenta en entornos remotos.
- **SoluciÃ³n Aplicada:**
    - **ReubicaciÃ³n:** Se moviÃ³ el `chat-widget` dentro del `#app-view`.
    - **Desacoplamiento:** Se aÃ±adiÃ³ un `setTimeout` de 500ms en `auth.js` para inicializar el chat de forma asÃ­ncrona e independiente de la API de perfil.
    - **Fuerza Bruta CSS:** Se usa `.style.setProperty('display', 'block', 'important')` en JS para garantizar visibilidad.
    - **Limpieza Docker:** Se eliminÃ³ `backend/Dockerfile` para dejar el de la raÃ­z como Ãºnica fuente de verdad (Single Source of Truth).

## [2026-04-24] Estrategia de Puertos Desacoplados (Dev vs Prod)
- **Problema:** Conflictos constantes con el puerto 3000 en el entorno local del desarrollador.
- **SoluciÃ³n Aplicada:**
    - Se configurÃ³ el puerto por defecto en `server.js` como **3001** (`process.env.PORT || 3001`).
    - Se mantuvo la configuraciÃ³n de **Docker (Dockerfile y Compose)** en el puerto **3000**.
- **Resultado:** El desarrollador puede correr `npm run dev` localmente sin interferencias, mientras que el despliegue en producciÃ³n sigue siendo transparente y compatible con la infraestructura existente de Coolify/Traefik.

## [2026-04-25] ModernizaciÃ³n y Blindaje del Asistente IA
- **Cambio:** RefactorizaciÃ³n total de la lÃ³gica de prompts y persistencia del chat.
- **Arquitectura Omnicanal:** Se centralizó la lógica de IA en `chatService.js` para que el chat Web y el bot de Telegram compartan el mismo "cerebro", herramientas y memoria semántica.
- **Seguridad en Telegram:** Implementado sistema de `link_token` con expiración para vincular identidades externas (Telegram ID) con usuarios de la DB local.
- **Colisión de Tokens (Aprendizaje):** Se detectó que procesos externos (n8n) pueden interceptar mensajes si comparten el mismo token de Telegram, devolviendo errores genéricos como "Unrecognized command".
- **Resiliencia de Modelos:** El sistema de fallback ahora filtra automáticamente modelos especializados (audio, transcribe, vision) para evitar fallos 400/404 durante la ejecución de herramientas.
- **Ranking de Inteligencia:** Los modelos se priorizan por `intelligence_score`, asegurando que las tareas complejas las resuelvan modelos con mayor capacidad de razonamiento.

### Base de Datos
- **ai_models:** Añadida columna `intelligence_score` (0-100) para ranking de modelos.
- **users:** Añadidas columnas `link_token` y `link_token_expiry` para vinculación segura.
- **external_identities:** Nueva tabla para mapear IDs de Telegram a usuarios locales.
- **chat_messages:** Mejorada la persistencia para incluir `duration_ms` y `tools_called`.
- **Seguridad y Robustez (Regla 10 y 11):**
    - Se implementÃ³ sanitizaciÃ³n de inputs para prevenir XSS e inyecciones de prompt.
    - Se blindÃ³ `executeTool` para manejar argumentos nulos (hotfix por error detectado con Llama-3 en herramientas sin parÃ¡metros).
- **LecciÃ³n Aprendida:** Los modelos de lenguaje pequeÃ±os o via APIs de terceros (Groq) a veces omiten el objeto de argumentos en herramientas de tipo "void". La normalizaciÃ³n de parÃ¡metros en el dispatcher es obligatoria para evitar crashes de Node.
## ðŸŽ“ Lecciones del Test Profundo (Abril 2026)

### 1. Incompatibilidad de Tipos en Tool Calling (LLM vs Schema)
- **Error:** Los modelos (especialmente OpenAI) fallan con error 400 si un esquema dice `NUMBER` y el bot envÃ­a `"1"`.
- **DecisiÃ³n:** Se cambiaron los IDs a `STRING` en las declaraciones de herramientas.
- **Blindaje:** `executeTool` ahora sanitiza y convierte a `Number` internamente. Esto hace al backend agnÃ³stico a la imprecisiÃ³n del LLM.

### 2. Poda de Contexto (Pruning) vs Rate Limits
- **Error:** Conversaciones largas con muchos resultados de herramientas superan el TPM (Tokens Per Minute) de los proveedores.
- **DecisiÃ³n:** Implementada poda en `chatController.js`. Se reemplaza informaciÃ³n de turnos antiguos (>4 pares) por un placeholder. Solo se mantiene el contexto fresco.

### 3. Interferencia SemÃ¡ntica (RAG Shadowing)
- **Error:** Los ejemplos recuperados de Qdrant pueden "envenenar" el razonamiento si no son 100% relevantes. El bot intentaba cancelar antes de reservar porque recordÃ³ un test anterior.
- **DecisiÃ³n:** Aumentado `score_threshold` a 0.90 y encapsulado de ejemplos en tags `<ejemplo_de_aprendizaje>` para separar hechos de referencias de estilo.

### 4. Cadena de Fallback Indestructible
- **Error:** El sistema quedaba "ciego" si Groq o Gemini fallaban por saturaciÃ³n.
- **DecisiÃ³n:** Se moviÃ³ OpenAI (gpt-4o-mini) al principio del fallback estÃ¡tico. Es el "ancla de estabilidad" del sistema.

## [2026-04-25] Integración Omnicanal: Telegram Bot
### Decisión de Arquitectura: ChatService
Para evitar la duplicidad de lógica entre el chat web y el bot de Telegram, se extrajo el motor de IA a backend/services/chatService.js.
- Beneficio: Cualquier mejora en el fallback, la poda de contexto o las herramientas se refleja en ambos canales automáticamente.
- Identidad: Se implementará una tabla external_identities para vincular el chat_id de Telegram con el user_id del sistema.

### Datos del Bot
- Username: @intareservas_bot
- Librería: telegraf
- Seguridad: Variable TELEGRAM_BOT_TOKEN.

## [2026-04-25] Sistema de Diseño Premium "Emerald Nocturne"
- **Rediseño Estético (Regla 2):** Migración total a una paleta HSL basada en Esmeralda (#10b981) y Obsidian Navy (#0e131e). Se eliminaron bordes sólidos en favor de sombras ambientales y `backdrop-filter` (Blur 12px-20px) siguiendo el estándar de Stitch.
- **Arquitectura de Identidades:** Se blindó el sistema de desvinculación de Telegram.
    - **Endpoint Unlink:** Implementada lógica en `userController.js` para permitir que usuarios se desvinculen y administradores gestionen la limpieza de identidades externas.
    - **Visibilidad Omnicanal:** Se actualizó el perfil del usuario para incluir el estado de vinculación en tiempo real, permitiendo que el Dashboard se adapte dinámicamente.
- **Exposición Global Segura:** Refactorización de `main.js` para centralizar la exposición de funciones al objeto `window`, manteniendo los módulos de características encapsulados y limpios.
- **Lección Aprendida (UI dinámico):** Al generar HTML dinámico en JS (como las tablas de admin), los `onclick` requieren que las funciones existan en el scope global. La centralización en `main.js` previene errores de "ReferenceError" y facilita el mantenimiento.
## [2026-04-26] Normalización Resiliente de Fechas (Formato Latino)
- **Cambio:** Se modificó el `systemPrompt` para solicitar fechas en formato `DD-MM-YYYY` o `DD/MM/YYYY` según preferencia del usuario.
- **Implementación Técnica:** Se añadió una capa de normalización en `executeTool` (backend) que detecta estos formatos mediante Regex y los convierte a ISO (`YYYY-MM-DD`) antes de procesar las herramientas.
- **Motivo:** Mejorar la UX local (Argentina/Latam) sin romper la integridad de la base de datos ni las herramientas existentes.
- **Riesgo Arquitectónico Detectado (Regla 1):** 
    - El uso de formatos manuales sigue siendo propenso a errores de digitación. 
    - La ambigüedad del año (2 o 4 dígitos) fue mitigada forzando 4 dígitos en el prompt del bot.
    - **Deuda:** Si en el futuro se internacionaliza la app (ej. USA usa MM-DD-YYYY), este parser fallará catastróficamente. Se recomienda usar una librería como `date-fns` o `luxon` si el alcance crece.

## [2026-04-27] Filtros Avanzados y Paginación Sincronizada (Gestión de Usuarios)

### Implementación de Filtros Dinámicos (Regla 7)
Se implementaron filtros por **Estado**, **Rol** y **Vinculación de Telegram** en el panel de administración.

- **Arquitectura Backend:** Se optó por una construcción dinámica de la cláusula `WHERE` en `userController.js`. 
    - **Telegram Query:** El filtrado por Telegram utiliza `EXISTS` sobre la tabla `external_identities`. Esta técnica es superior a un `JOIN` para este caso de uso, ya que evita la duplicación de filas si un usuario tuviera múltiples identidades (aunque la lógica actual es 1:1).
    - **Sincronización:** Se garantizó que la consulta de `COUNT(*)` use exactamente la misma `whereClause` que la consulta de datos, evitando inconsistencias en la UI de paginación.

### UI/UX Premium (Regla 2)
- Se rediseñó la cabecera de "Gestión de Usuarios" para integrar selectores de filtrado sin romper la estética **Emerald Nocturne**.
- Se optimizó el layout para ser responsivo (usando `xl:flex-row` y `flex-wrap`), asegurando que las herramientas de administración sean utilizables en tablets y móviles.

### Riesgos y Deuda Técnica (Regla 1)
- **Rendimiento de Subqueries:** El uso de `EXISTS` en el `WHERE` puede ser costoso en tablas de millones de registros sin índices adecuados. Se recomienda un índice compuesto `(user_id, provider)` en `external_identities`.
- **Estado Global:** La gestión del estado en `state.js` sigue creciendo de forma lineal. A largo plazo, se recomienda migrar a un patrón de "Store" con selectores para evitar la dispersión de variables `currentXFilters`.
