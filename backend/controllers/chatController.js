const { GoogleGenAI } = require('@google/genai');
const OpenAI = require('openai');
const { toolDeclarations, executeTool, TOOLS_ADMIN } = require('../services/chatTools');
const { getActiveModels, recordResponseTime, recordError } = require('../services/modelDiscovery');
const { recordSuccess, recordCorrection, isCorrection, actionTypeFromTools } = require('../services/chatFeedback');
const pool = require('../config/db');

const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const groq      = new OpenAI({ apiKey: process.env.GROQ_API_KEY,      baseURL: 'https://api.groq.com/openai/v1'        });
const cerebras  = new OpenAI({ apiKey: process.env.CEREBRAS_API_KEY,  baseURL: 'https://api.cerebras.ai/v1'            });

// ─── Memoria de conversación por usuario ──────────────────────────────────────
// sessionId = userId. Guarda los últimos MAX_MEMORY pares (user + model).
// Se limpia automáticamente tras SESSION_TTL_MS de inactividad.
const MAX_MEMORY   = 10;  // pares de mensajes (user + model)
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutos sin actividad → reset

const sessionStore = new Map(); // Map<userId, { history: [], pendingContext: {}, lastActivity: Date }>

function getSession(userId) {
    const now = Date.now();
    const session = sessionStore.get(userId);

    if (session && now - session.lastActivity > SESSION_TTL_MS) {
        sessionStore.delete(userId);
        console.log(`[${ts()}] [Memory] Sesión de usuario ${userId} expirada — memoria reseteada`);
        return { history: [], pendingContext: {}, lastActivity: now };
    }

    return session || { history: [], pendingContext: {}, lastActivity: now };
}

function saveToSession(userId, userMsg, modelMsg, pendingContext = null) {
    const session = getSession(userId);
    session.history.push({ role: 'user',  text: userMsg  });
    session.history.push({ role: 'model', text: modelMsg });

    if (session.history.length > MAX_MEMORY * 2) {
        session.history = session.history.slice(-(MAX_MEMORY * 2));
    }

    // Actualizar contexto pendiente: si el modelo devuelve datos estructurados, guardarlos
    if (pendingContext !== null) {
        session.pendingContext = pendingContext;
    }

    session.lastActivity = Date.now();
    sessionStore.set(userId, session);
}

// Extrae metadatos estructurados de la respuesta del modelo (formato <!--meta:{...}-->)
// y devuelve { cleanText, meta }
function extractMeta(text) {
    const match = text?.match(/<!--meta:(.*?)-->/s);
    if (!match) return { cleanText: text, meta: null };
    try {
        const meta = JSON.parse(match[1]);
        const cleanText = text.replace(/\n*<!--meta:.*?-->\n*/s, '').trim();
        return { cleanText, meta };
    } catch {
        return { cleanText: text, meta: null };
    }
}

function clearSession(userId) {
    sessionStore.delete(userId);
    console.log(`[${ts()}] [Memory] Memoria del usuario ${userId} limpiada`);
}

async function logChatMessage({ userId, sessionId, role, message, systemPrompt, modelUsed, tokensInput, tokensOutput, toolsCalled, durationMs }) {
    try {
        await pool.query(
            `INSERT INTO chat_messages (user_id, session_id, role, message, system_prompt, model_used, tokens_input, tokens_output, tools_called, duration_ms)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, sessionId, role, message, systemPrompt || null,
             modelUsed || null, tokensInput || null, tokensOutput || null,
             toolsCalled?.length ? JSON.stringify(toolsCalled) : null,
             durationMs || null]
        );
    } catch (e) {
        console.error(`[${ts()}] [ChatLog] Error guardando mensaje en BD:`, e.message);
    }
}

// ─── Cadena de fallback ────────────────────────────────────────────────────────
// Se carga desde BD al arrancar (discoverModels en server.js) y se refresca cada hora.
// Fallback estático por si la BD aún no tiene datos (primer arranque antes de discovery).
const STATIC_FALLBACK = [
    { provider: 'cerebras', model: 'qwen-3-235b-a22b-instruct-2507' },
    { provider: 'groq',     model: 'llama-3.3-70b-versatile'        },
    { provider: 'gemini',   model: 'gemini-2.0-flash'               },
];

let MODELS_FALLBACK = [...STATIC_FALLBACK];

async function refreshModels() {
    try {
        const models = await getActiveModels();
        if (models.length > 0) {
            MODELS_FALLBACK = models;
            console.log(`[${new Date().toLocaleString('es-AR')}] [ChatController] Modelos actualizados desde BD: ${models.length} disponibles`);
        }
    } catch (e) {
        console.warn(`[ChatController] No se pudo refrescar modelos desde BD: ${e.message}`);
    }
}

// Refrescar cada hora automáticamente (el primer llamado lo hace server.js tras el discovery)
setInterval(refreshModels, 60 * 60 * 1000);

function ts() {
    return new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour12: false });
}

function isRetryableError(error) {
    const msg = (error?.message || '').toLowerCase();
    return msg.includes('429') || msg.includes('503') || msg.includes('404') ||
           msg.includes('resource_exhausted') || msg.includes('unavailable') ||
           msg.includes('not found') || msg.includes('not supported') ||
           msg.includes('rate_limit_exceeded') || msg.includes('overloaded');
}

// ─── Adaptador Gemini ──────────────────────────────────────────────────────────
async function callGemini(model, contents, systemPrompt, allowedTools) {
    const response = await gemini.models.generateContent({
        model,
        contents,
        config: {
            systemInstruction: systemPrompt,
            tools: [{ functionDeclarations: allowedTools }]
        }
    });
    const parts = response.candidates?.[0]?.content?.parts || [];
    const functionCalls = parts
        .filter(p => p.functionCall)
        .map(p => ({ name: p.functionCall.name, args: p.functionCall.args || {} }));
    const textPart = parts.find(p => p.text);
    return { text: textPart?.text || null, functionCalls, raw: response };
}

// Convierte toolDeclarations de Gemini a formato OpenAI, filtrando por rol
function geminiToolsToOpenAI(userRole) {
    return toolDeclarations
        .filter(t => {
            const is_admin_tool = TOOLS_ADMIN.has(t.name);
            return userRole === 'admin' || !is_admin_tool;
        })
        .map(t => ({
        type: 'function',
        function: {
            name: t.name,
            description: t.description,
            parameters: {
                type: 'object',
                properties: Object.fromEntries(
                    Object.entries(t.parameters.properties || {}).map(([k, v]) => [k, { type: v.type.toLowerCase(), description: v.description }])
                ),
                required: t.parameters.required || []
            }
        }
    }));
}

// Convierte historial de contents (formato Gemini) a mensajes OpenAI
function contentsToOpenAIMessages(contents, systemPrompt) {
    const messages = [{ role: 'system', content: systemPrompt }];

    // Mapa global de nombre de tool → tool_call_id para mantener coherencia entre turnos
    const toolCallIdMap = new Map();
    let callCounter = 0;

    for (const c of contents) {
        if (c.role === 'user') {
            messages.push({ role: 'user', content: c.parts?.[0]?.text || '' });
        } else if (c.role === 'model') {
            const toolCalls = c.parts
                ?.filter(p => p.functionCall)
                .map(p => {
                    const id = `call_${callCounter++}`;
                    // Guardar el id para que el tool result lo referencie correctamente
                    toolCallIdMap.set(`${p.functionCall.name}_${callCounter - 1}`, id);
                    return {
                        id,
                        type: 'function',
                        function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args || {}) }
                    };
                });
            if (toolCalls?.length) {
                messages.push({ role: 'assistant', tool_calls: toolCalls });
                // Asociar cada tool call por posición para el resultado siguiente
                toolCalls.forEach((tc, idx) => toolCallIdMap.set(`pending_${idx}`, tc.id));
            }
        } else if (c.role === 'tool') {
            const toolParts = (c.parts || []).filter(p => p.functionResponse);
            toolParts.forEach((p, idx) => {
                const id = toolCallIdMap.get(`pending_${idx}`) || `call_${idx}`;
                messages.push({
                    role: 'tool',
                    tool_call_id: id,
                    content: JSON.stringify(p.functionResponse.response)
                });
            });
            // Limpiar pending después de consumirlos
            toolCallIdMap.forEach((_, k) => { if (k.startsWith('pending_')) toolCallIdMap.delete(k); });
        }
    }
    return messages;
}

async function callOpenAI(model, contents, systemPrompt, userRole, client = openai) {
    const messages = contentsToOpenAIMessages(contents, systemPrompt);
    const response = await client.chat.completions.create({
        model,
        messages,
        tools: geminiToolsToOpenAI(userRole),
        tool_choice: 'auto'
    });
    const choice = response.choices?.[0];
    const toolCalls = choice?.message?.tool_calls || [];
    const functionCalls = toolCalls.map(tc => ({
        name: tc.function.name,
        args: JSON.parse(tc.function.arguments || '{}')
    }));
    // Algunos modelos (qwen3, deepseek) envuelven el razonamiento en <think>...</think>
    // antes del texto visible — lo descartamos
    const rawContent = choice?.message?.content || null;
    const text = rawContent ? rawContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim() || null : null;
    return { text, functionCalls, raw: response };
}

// ─── Dispatcher unificado ──────────────────────────────────────────────────────
async function generateWithFallback(contents, systemPrompt, userRole, fixedEntry = null) {
    const candidates = fixedEntry ? [fixedEntry] : MODELS_FALLBACK;

    for (const entry of candidates) {
        try {
            const t0 = Date.now();
            let result;
            if (entry.provider === 'gemini') {
                const allowedTools = toolDeclarations.filter(t => {
                    const is_admin_tool = TOOLS_ADMIN.has(t.name);
                    return userRole === 'admin' || !is_admin_tool;
                });
                result = await callGemini(entry.model, contents, systemPrompt, allowedTools);
            } else if (entry.provider === 'groq') {
                result = await callOpenAI(entry.model, contents, systemPrompt, userRole, groq);
            } else if (entry.provider === 'cerebras') {
                result = await callOpenAI(entry.model, contents, systemPrompt, userRole, cerebras);
            } else {
                result = await callOpenAI(entry.model, contents, systemPrompt, userRole);
            }
            const responseMs = Date.now() - t0;
            recordResponseTime(entry.provider, entry.model, responseMs);
            if (entry !== MODELS_FALLBACK[0]) {
                console.log(`[${ts()}] [ChatController] Fallback activo: usando ${entry.provider}/${entry.model}`);
            }
            return { result, entry };
        } catch (error) {
            if (isRetryableError(error)) {
                console.warn(`[${ts()}] [ChatController] Modelo ${entry.provider}/${entry.model} no disponible (${error.message.slice(0, 60)}...). Probando siguiente...`);
                recordError(entry.provider, entry.model, error.message);
                // Sacarlo de memoria para no intentarlo de nuevo hasta el próximo refreshModels
                MODELS_FALLBACK = MODELS_FALLBACK.filter(m => !(m.provider === entry.provider && m.model === entry.model));
                continue;
            }
            throw error;
        }
    }
    throw new Error('Todos los modelos están sin disponibilidad en este momento. Intentá de nuevo en unos minutos.');
}

// ─── System prompts por rol ────────────────────────────────────────────────────

const AYUDA_SISTEMA = `
=== GUÍA DEL SISTEMA DE RESERVAS INTA ===

El sistema permite reservar espacios/salas del INTA. Esto es lo que podés hacer:

PARA TODOS LOS USUARIOS:
• Ver tus reservas: "Mostrá mis reservas", "¿Qué reservas tengo esta semana?"
• Consultar espacios: "¿Qué salas hay disponibles?", "Listá los espacios"
• Verificar disponibilidad: "¿El auditorio está libre el viernes a las 10?"
• Crear una reserva: "Reservá la sala A el lunes de 9 a 11", "Quiero reservar el auditorio mañana"
• Cancelar una reserva propia: "Cancelá mi reserva #12", "Quiero cancelar la reserva del martes"

ESTADOS DE UNA RESERVA:
• pendiente → recién creada, esperando aprobación del admin
• aprobada → confirmada, el espacio está reservado
• rechazada → el admin la rechazó
• cancelada → fue cancelada por el usuario o un admin

FLUJO TÍPICO:
1. El usuario crea una reserva (queda en "pendiente")
2. Un admin la aprueba o rechaza
3. Si fue aprobada, el espacio queda bloqueado para ese horario

NOTAS IMPORTANTES:
• No se pueden hacer reservas en horarios superpuestos en el mismo espacio
• Para reservar necesitás saber el ID del espacio (podés pedirlo con "Listá los espacios")
• Las fechas van en formato día/mes/año cuando las mencionés (yo las convierto internamente)
`;

const AYUDA_ADMIN = `
=== GUÍA DEL SISTEMA DE RESERVAS INTA — PANEL DE ADMINISTRADOR ===

Además de todo lo que puede hacer un usuario, como administrador podés:

GESTIÓN DE RESERVAS:
• Ver todas las reservas: "Mostrá todas las reservas de hoy", "¿Cuántas reservas pendientes hay?"
• Aprobar/rechazar: "Aprobá la reserva #5", "Rechazá la reserva #8"
• Cancelar cualquier reserva: "Cancelá la reserva #12 de Juan"

GESTIÓN DE ESPACIOS:
• Crear un espacio: "Creá un espacio llamado Sala B con descripción Sala para reuniones pequeñas"
• Actualizar: "Actualizá el espacio #2, nuevo nombre: Sala Magna"
• Desactivar: "Desactivá el espacio #3" (soft delete, no se borra)

GESTIÓN DE USUARIOS:
• Listar usuarios: "Mostrá todos los usuarios", "Buscá el usuario juan@inta.gob.ar"
• Suspender: "Suspendé al usuario #4"
• Activar: "Activá al usuario #7" (aprueba cuentas nuevas pendientes)
• Cambiar rol: "Cambiá el rol del usuario #5" (alterna entre usuario y admin)

AUDITORÍA:
• Ver logs: "Mostrá la actividad de hoy", "¿Qué hizo el usuario carlos@inta.gob.ar?"
• Filtrar: "Mostrá los logs de creación de reservas de esta semana"

FLUJO DE APROBACIÓN DE USUARIOS:
Los usuarios nuevos (locales y Google) quedan con cuenta inactiva hasta que un admin los active.
Para aprobar: "Activá al usuario #ID"

NOTAS:
• No podés suspender ni cambiar el rol de otros administradores
• No podés gestionar tu propio usuario desde el chat
`;

function buildSystemPrompt(user) {
    const ahora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
    const hoy   = ahora.toISOString().split('T')[0];
    const diaSemana = ahora.toLocaleDateString('es-AR', { weekday: 'long', timeZone: 'America/Argentina/Buenos_Aires' });
    const esAdmin = user.role === 'admin';

    return `Sos el asistente virtual del Sistema de Reservas INTA.
Tu nombre es "Asistente INTA". Respondés siempre en español rioplatense, de forma clara y directa. Tu personalidad es amable y con un toque pícaro — usás humor suave, algún comentario ingenioso cuando viene al caso, y tratás al usuario de "vos" con calidez. Sin exagerar ni hacer chistes en cada línea — solo ese toque que hace la conversación más humana.

USUARIO ACTUAL:
- Nombre: ${user.name || 'Usuario'}
- Email: ${user.email}
- Rol: ${user.role} ${esAdmin ? '(tenés acceso completo de administrador)' : '(acceso estándar de usuario)'}
- Fecha de hoy: ${hoy} (${diaSemana})
- Zona horaria: America/Argentina/Buenos_Aires (UTC-3, sin cambio de horario)

${esAdmin ? AYUDA_ADMIN : AYUDA_SISTEMA}

REGLAS DE COMPORTAMIENTO:
1. Cuando el usuario pida información o quiera hacer algo, usá las tools disponibles. NUNCA inventes datos ni nombres de espacios — si el usuario pregunta qué puede reservar o qué espacios hay, ejecutá "listar_espacios" de inmediato.
2. Si el usuario pregunta cómo usar el sistema en términos generales (flujo, estados, permisos), explicalo usando la guía de arriba. Si pregunta qué espacios hay disponibles, usá la tool.
3. Si el usuario quiere CREAR una reserva y le faltan datos (espacio, fecha u horario), preguntale lo que falta ANTES de ejecutar la tool. Para CANCELAR o CONSULTAR: NUNCA pidas el ID, NUNCA preguntes qué reserva es — ejecutá "mis_reservas" de inmediato con los datos que te dio y buscá vos.
4. Si el usuario menciona un nombre de espacio (ej: "el auditorio", "la sala 1"), usá "mis_reservas" con la fecha mencionada y filtrá por el espacio. NUNCA preguntes el ID del espacio ni el número de reserva.
5. Convertí las fechas relativas ("mañana", "el lunes", "la próxima semana") al formato YYYY-MM-DD usando la fecha de hoy como referencia.
6. Las horas van en formato HH:MM (24hs). Si el usuario dice "10 de la mañana" → "10:00". Si dice "3 de la tarde" → "15:00".
7. Nunca muestres IDs técnicos crudos al usuario — usá siempre los nombres.
8. Si una operación falla, explicá el error de forma simple y sugerí una alternativa cuando sea posible.
9. ${esAdmin
    ? 'Para acciones destructivas importantes (desactivar un espacio, suspender un usuario, cambiar rol), confirmá con el admin antes de ejecutar.'
    : 'Si el usuario intenta hacer algo que requiere permisos de administrador, explicale amablemente que no tiene acceso y que debe contactar a un administrador.'}
10. Sé conciso. No des explicaciones largas si no son necesarias.
11. FLUJO DE CONFIRMACIÓN: Si ya le mostraste al usuario los datos de una reserva y le preguntaste si quiere cancelar/modificar, y el usuario responde afirmativamente ("sí", "dale", "cancelá", "confirmá", "ok", etc.), ejecutá la acción INMEDIATAMENTE sin volver a mostrar los datos ni repetir la pregunta. No repitas información que ya mostraste en el turno anterior.
12. NUNCA repitas en tu respuesta información que ya mostraste en el turno inmediatamente anterior. Si el usuario confirma una acción, ejecutala y confirmá el resultado con una sola línea corta.`;
}

// ─── Handler principal ─────────────────────────────────────────────────────────

const sendMessage = async (req, res) => {
    const { message } = req.body;
    const user   = req.user;
    const userIp = req.ip;
    const reqId  = Math.random().toString(36).slice(2, 8).toUpperCase();

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ message: 'El mensaje no puede estar vacío.' });
    }

    const session = getSession(user.id);

    console.log(`[${ts()}] [Chat:${reqId}] ► ENTRADA | usuario: ${user.email} (${user.role}) | IP: ${userIp} | memoria: ${session.history.length / 2} pares`);
    console.log(`[${ts()}] [Chat:${reqId}] ► MENSAJE: "${message.trim().slice(0, 120)}${message.length > 120 ? '...' : ''}"`);

    const t0 = Date.now();

    try {
        const systemPrompt = buildSystemPrompt(user);

        console.log(`[${ts()}] [Chat:${reqId}] ── SYSTEM PROMPT (${user.role}) ──────────────────`);
        console.log(systemPrompt);
        console.log(`[${ts()}] [Chat:${reqId}] ────────────────────────────────────────────────`);

        // Construir contents desde la memoria del servidor + mensaje actual
        const contents = [
            ...session.history.map(turn => ({
                role: turn.role,
                parts: [{ text: turn.text }]
            })),
            { role: 'user', parts: [{ text: message.trim() }] }
        ];

        console.log(`[${ts()}] [Chat:${reqId}] ── CONTENIDO ENVIADO AL MODELO ─────────────────`);
        contents.forEach((c, i) => {
            const texto = c.parts?.map(p => p.text || (p.functionCall ? `[tool_call: ${p.functionCall.name}]` : (p.functionResponse ? `[tool_result: ${p.functionResponse.name}]` : '[part]'))).join(' ') || '';
            console.log(`  [${i}] ${c.role}: ${texto.slice(0, 200)}${texto.length > 200 ? '...' : ''}`);
        });
        console.log(`[${ts()}] [Chat:${reqId}] ────────────────────────────────────────────────`);

        let { result, entry: activeEntry } = await generateWithFallback(contents, systemPrompt, user.role);
        console.log(`[${ts()}] [Chat:${reqId}] ✓ Modelo seleccionado: ${activeEntry.provider}/${activeEntry.model}`);

        // Agentic loop: ejecutar tools hasta respuesta final en texto
        let iterations  = 0;
        const MAX_ITERATIONS = 6;
        const toolsCalled = []; // acumular todas las tools del ciclo completo
        let tokensInput   = 0;
        let tokensOutput  = 0;

        while (iterations < MAX_ITERATIONS) {
            iterations++;

            if (result.functionCalls.length === 0) break;

            const toolNames = result.functionCalls.map(fc => fc.name).join(', ');
            console.log(`[${ts()}] [Chat:${reqId}] ⚙ Turno ${iterations} — tools: [${toolNames}] args: ${JSON.stringify(result.functionCalls.map(fc => fc.args))}`);
            toolsCalled.push(...result.functionCalls.map(fc => fc.name));

            const toolResults = await Promise.all(
                result.functionCalls.map(async ({ name, args }) => {
                    const t1 = Date.now();
                    const toolResult = await executeTool(name, args, user.id, user.role, userIp);
                    const ok = !toolResult.error;
                    console.log(`[${ts()}] [Chat:${reqId}]   ${ok ? '✓' : '✗'} tool "${name}" → ${ok ? 'OK' : 'ERROR: ' + toolResult.error} (${Date.now() - t1}ms)`);
                    return { name, response: toolResult };
                })
            );

            contents.push({
                role: 'model',
                parts: result.functionCalls.map(fc => ({ functionCall: { name: fc.name, args: fc.args } }))
            });
            contents.push({
                role: 'tool',
                parts: toolResults.map(tr => ({ functionResponse: { name: tr.name, response: tr.response } }))
            });

            console.log(`[${ts()}] [Chat:${reqId}] ── CONTENIDO TURNO ${iterations + 1} ────────────────────`);
            contents.slice(-2).forEach((c, i) => {
                const texto = c.parts?.map(p =>
                    p.text || (p.functionCall ? `[tool_call: ${p.functionCall.name}]` :
                    (p.functionResponse ? `[tool_result: ${p.functionResponse.name} → ${JSON.stringify(p.functionResponse.response).slice(0, 150)}]` : '[part]'))
                ).join(' ') || '';
                console.log(`  [-${2 - i}] ${c.role}: ${texto.slice(0, 300)}${texto.length > 300 ? '...' : ''}`);
            });
            console.log(`[${ts()}] [Chat:${reqId}] ────────────────────────────────────────────────`);

            ({ result } = await generateWithFallback(contents, systemPrompt, user.role, activeEntry));
        }

        // Extraer tokens de la respuesta final (Gemini los devuelve en usageMetadata)
        const usage = result.raw?.usageMetadata || result.raw?.usage;
        if (usage) {
            tokensInput  = usage.promptTokenCount     || usage.prompt_tokens     || 0;
            tokensOutput = usage.candidatesTokenCount || usage.completion_tokens || 0;
        }

        if (!result.text) {
            console.warn(`[${ts()}] [Chat:${reqId}] ⚠ Sin texto en respuesta final | functionCalls pendientes: ${result.functionCalls.length}`);
        }

        const rawReply   = result.text || 'No pude generar una respuesta. Intentá de nuevo.';
        const { cleanText: replyText, meta } = extractMeta(rawReply);
        if (meta) console.log(`[${ts()}] [Chat:${reqId}] 🔖 Meta capturado:`, JSON.stringify(meta));
        else if (rawReply !== replyText) console.log(`[${ts()}] [Chat:${reqId}] ⚠ Sin meta — raw tenía diferencias`);
        else console.log(`[${ts()}] [Chat:${reqId}] ⚠ Sin meta en respuesta`);
        const durationMs = Date.now() - t0;
        const modelLabel = `${activeEntry.provider}/${activeEntry.model}`;

        // Guardar en memoria — si hay meta, actualizamos pendingContext; si no, lo limpiamos
        saveToSession(user.id, message.trim(), replyText, meta || {});

        // Aprendizaje: registrar éxito o corrección (fire and forget)
        if (isCorrection(message.trim()) && session.pendingContext?.accion) {
            recordCorrection(message.trim(), actionTypeFromTools(toolsCalled));
        } else if (toolsCalled.length) {
            recordSuccess(message.trim(), replyText, toolsCalled);
        }

        // Persistir en BD (fire and forget — no bloqueamos la respuesta)
        logChatMessage({ userId: user.id, sessionId: reqId, role: 'user',  message: message.trim(), systemPrompt: null,         modelUsed: modelLabel, tokensInput, tokensOutput: 0, toolsCalled: [], durationMs });
        logChatMessage({ userId: user.id, sessionId: reqId, role: 'model', message: replyText,      systemPrompt,               modelUsed: modelLabel, tokensInput: 0, tokensOutput,    toolsCalled,     durationMs });

        console.log(`[${ts()}] [Chat:${reqId}] ◄ RESPUESTA (${durationMs}ms, ${iterations} turno/s, tokens: ${tokensInput}▶${tokensOutput}, tools: [${toolsCalled.join(',')||'ninguna'}]): "${replyText.slice(0, 120)}${replyText.length > 120 ? '...' : ''}"`);

        res.json({ reply: replyText });

    } catch (error) {
        console.error(`[${ts()}] [Chat:${reqId}] ✗ ERROR (${Date.now() - t0}ms):`, error.message);
        const userMessage = isRetryableError(error) || error.message.includes('modelos')
            ? 'El servicio de IA está con alta demanda en este momento. Intentá de nuevo en unos segundos.'
            : 'Error al procesar tu mensaje. Intentá de nuevo.';
        res.status(500).json({ message: userMessage });
    }
};

module.exports = { sendMessage, clearSession, refreshModels };
