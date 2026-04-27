const { GoogleGenAI } = require('@google/genai');
const OpenAI = require('openai');
const { toolDeclarations, executeTool, TOOLS_ADMIN } = require('../services/chatTools');
const { getActiveModels, recordResponseTime, recordError } = require('../services/modelDiscovery');
const { recordSuccess, recordCorrection, isCorrection, actionTypeFromTools, buildFewShotBlock } = require('../services/chatFeedback');
const pool = require('../config/db');
const prompts = require('../config/chatPrompts');

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

async function getSession(userId) {
    const now = Date.now();
    let session = sessionStore.get(userId);

    // 1. Si existe en RAM y no expiró, devolverla
    if (session) {
        if (now - session.lastActivity > SESSION_TTL_MS) {
            sessionStore.delete(userId);
            console.log(`[${ts()}] [Memory] Sesión de usuario ${userId} expirada — memoria reseteada`);
        } else {
            return session;
        }
    }

    // 2. Si no está en RAM o expiró, intentar rehidratar desde DB
    console.log(`[${ts()}] [Memory] Rehidratando sesión del usuario ${userId} desde DB...`);
    try {
        const [rows] = await pool.query(
            `SELECT role, message FROM chat_messages 
             WHERE user_id = ? 
             ORDER BY created_at DESC LIMIT ?`,
            [userId, MAX_MEMORY * 2]
        );

        const history = rows.reverse().map(r => ({
            role: r.role === 'model' ? 'model' : 'user',
            text: r.message
        }));

        session = { history, pendingContext: {}, lastActivity: now };
        sessionStore.set(userId, session);
        return session;
    } catch (e) {
        console.error(`[${ts()}] [Memory] Error rehidratando sesión:`, e.message);
        return { history: [], pendingContext: {}, lastActivity: now };
    }
}

function saveToSession(userId, userMsg, modelMsg, pendingContext = null) {
    const session = sessionStore.get(userId);
    if (!session) return; // No debería pasar si se llamó a getSession antes
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
    { provider: 'openai',   model: 'gpt-4o-mini'                    },
    { provider: 'gemini',   model: 'gemini-2.0-flash'               },
    { provider: 'cerebras', model: 'qwen-3-235b-a22b-instruct-2507' },
    { provider: 'groq',     model: 'llama-3.3-70b-versatile'        },
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
    // Si no hay modelos en la lista dinámica, volvemos a la estática de emergencia
    let candidates = fixedEntry ? [fixedEntry] : (MODELS_FALLBACK.length > 0 ? MODELS_FALLBACK : STATIC_FALLBACK);

    for (const entry of candidates) {
        try {
            const t0 = Date.now();
            let result;
            
            console.log(`[${ts()}] [ChatController] Intentando con ${entry.provider}/${entry.model}...`);

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
            
            return { result, entry };
        } catch (error) {
            entry.lastErrorMsg = error.message;
            if (isRetryableError(error)) {
                console.warn(`[${ts()}] [ChatController] ⚠ Modelo ${entry.provider}/${entry.model} falló: ${error.message.slice(0, 80)}`);
                recordError(entry.provider, entry.model, error.message);
                
                // Solo lo sacamos de la lista si hay más opciones
                if (MODELS_FALLBACK.length > 1) {
                    MODELS_FALLBACK = MODELS_FALLBACK.filter(m => !(m.provider === entry.provider && m.model === entry.model));
                }
                continue;
            }
            console.error(`[${ts()}] [ChatController] ❌ Error no reintentable en ${entry.provider}:`, error.message);
            throw error;
        }
    }
    const lastError = candidates[candidates.length - 1]?.lastErrorMsg || 'Causa desconocida';
    throw new Error(`Todos los modelos están saturados o sin cuota. Último error: ${lastError}`);
}

// ─── System prompts por rol ────────────────────────────────────────────────────

async function buildSystemPrompt(user, currentUserMessage = null) {
    const ahora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
    const hoy   = ahora.toISOString().split('T')[0];
    const diaSemana = ahora.toLocaleDateString('es-AR', { weekday: 'long', timeZone: 'America/Argentina/Buenos_Aires' });
    const esAdmin = user.role === 'admin';

    // Obtener ejemplos aprendidos de la base de datos (Búsqueda Semántica)
    const dynamicExamples = await buildFewShotBlock(currentUserMessage);

    return `
${prompts.PERSONALIDAD}

CONTEXTO ACTUAL:
- Usuario: ${user.name || 'Usuario'} (${user.email})
- Rol: ${user.role} ${esAdmin ? '(Administrador)' : '(Usuario Estándar)'}
- Fecha: ${hoy} (${diaSemana})
- Zona Horaria: America/Argentina/Buenos_Aires (UTC-3)

${prompts.REGLAS_GENERALES}

${esAdmin ? prompts.GUIA_ADMIN : prompts.GUIA_USUARIO}

${dynamicExamples}

${prompts.CHAIN_OF_THOUGHT}

RECORDATORIO FINAL: Sé conciso, no repitas lo que ya dijiste y usá siempre el voseo rioplatense.
`;
}

// ─── Handler principal ─────────────────────────────────────────────────────────

const chatService = require('../services/chatService');

// ... (resto de imports se mantienen)

const sendMessage = async (req, res) => {
    const { message } = req.body;
    const user   = req.user;
    const userIp = req.ip;
    const reqId  = Math.random().toString(36).slice(2, 8).toUpperCase();

    const cleanMessage = (message || '').toString().replace(/<[^>]*>?/gm, '').trim();
    if (cleanMessage.length === 0) return res.status(400).json({ message: 'El mensaje no puede estar vacío.' });

    const session = await getSession(user.id);
    console.log(`[${ts()}] [Chat:${reqId}] ► ENTRADA | usuario: ${user.email} | memoria: ${session.history.length / 2} pares`);

    try {
        // ─── Procesamiento con el Servicio Centralizado (Regla 12) ──────────────────
        const { text: aiResponseText, history: updatedHistory } = await chatService.processMessage(
            user.id, 
            user.role, 
            userIp, 
            cleanMessage, 
            session.history
        );

        // Enviar respuesta al cliente inmediatamente para mejorar UX (Regla 11)
        res.json({ response: aiResponseText });

        // Tareas de fondo (Logs y Memoria)
        try {
            await logChatMessage({ userId: user.id, sessionId: reqId, role: 'user', message: cleanMessage });
            await logChatMessage({ userId: user.id, sessionId: reqId, role: 'model', message: aiResponseText });

            session.history.push({ role: 'user', text: cleanMessage });
            session.history.push({ role: 'model', text: aiResponseText });
            if (session.history.length > MAX_MEMORY * 2) {
                session.history = session.history.slice(-MAX_MEMORY * 2);
            }
        } catch (bgError) {
            console.error(`[${ts()}] [Chat:${reqId}] Error en tareas de fondo:`, bgError.message);
        }

    } catch (error) {
        console.error(`[${ts()}] [Chat:${reqId}] ✗ Error en proceso IA:`, error);
        // Si no se envió respuesta aún, enviar error
        if (!res.headersSent) {
            res.status(500).json({ 
                message: 'Error al procesar tu mensaje. Intentá de nuevo.',
                debug: error.message
            });
        }
    }
};

module.exports = { sendMessage, clearSession, refreshModels };
