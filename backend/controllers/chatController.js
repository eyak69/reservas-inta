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

const sendMessage = async (req, res) => {
    const { message } = req.body;
    const user   = req.user;
    const userIp = req.ip;
    const reqId  = Math.random().toString(36).slice(2, 8).toUpperCase();

    // Sanitización básica (Regla 10): Trim y remoción de tags HTML para evitar XSS/Inyecciones
    const cleanMessage = (message || '').toString()
        .replace(/<[^>]*>?/gm, '') // Quitar HTML
        .trim();

    if (cleanMessage.length === 0) {
        return res.status(400).json({ message: 'El mensaje no puede estar vacío.' });
    }

    const session = await getSession(user.id);

    console.log(`[${ts()}] [Chat:${reqId}] ► ENTRADA | usuario: ${user.email} (${user.role}) | IP: ${userIp} | memoria: ${session.history.length / 2} pares`);
    console.log(`[${ts()}] [Chat:${reqId}] ► MENSAJE: "${cleanMessage.slice(0, 120)}${cleanMessage.length > 120 ? '...' : ''}"`);

    const t0 = Date.now();

    try {
        const systemPrompt = await buildSystemPrompt(user, cleanMessage);

        console.log(`[${ts()}] [Chat:${reqId}] ── SYSTEM PROMPT (${user.role}) ──────────────────`);
        console.log(systemPrompt);
        console.log(`[${ts()}] [Chat:${reqId}] ────────────────────────────────────────────────`);

        // ─── Poda de Contexto (Regla 11: Resiliencia) ────────────────────────────────
        // Solo mantenemos los últimos 6 mensajes del historial + el actual
        // Y eliminamos resultados de herramientas de turnos antiguos para ahorrar tokens
        const prunedHistory = session.history.slice(-12); // 6 pares aprox
        
        const contents = [
            ...prunedHistory.map((turn, idx) => {
                // Si el turno es muy viejo (no es de los últimos 4), le quitamos el peso de tool results
                const isOld = idx < prunedHistory.length - 4;
                return {
                    role: turn.role,
                    parts: [{ text: isOld ? `[Información antigua omitida para ahorrar espacio]` : turn.text }]
                };
            }),
            { role: 'user', parts: [{ text: cleanMessage }] }
        ];

        console.log(`[${ts()}] [Chat:${reqId}] ── CONTENIDO ENVIADO (Pruned) ─────────────────`);
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
        if (isCorrection(cleanMessage) && session.pendingContext?.accion) {
            recordCorrection(cleanMessage, actionTypeFromTools(toolsCalled));
        } else if (toolsCalled.length) {
            recordSuccess(cleanMessage, replyText, toolsCalled);
        }

        // Persistir en BD (fire and forget — no bloqueamos la respuesta)
        logChatMessage({ userId: user.id, sessionId: reqId, role: 'user',  message: cleanMessage, systemPrompt: null,         modelUsed: modelLabel, tokensInput, tokensOutput: 0, toolsCalled: [], durationMs });
        logChatMessage({ userId: user.id, sessionId: reqId, role: 'model', message: replyText,      systemPrompt,               modelUsed: modelLabel, tokensInput: 0, tokensOutput,    toolsCalled,     durationMs });

        console.log(`[${ts()}] [Chat:${reqId}] ◄ RESPUESTA (${durationMs}ms, ${iterations} turno/s, tokens: ${tokensInput}▶${tokensOutput}, tools: [${toolsCalled.join(',')||'ninguna'}]): "${replyText.slice(0, 120)}${replyText.length > 120 ? '...' : ''}"`);

        res.json({ reply: replyText });

    } catch (error) {
        console.error(`[${ts()}] [Chat:${reqId}] ❌ Error CRÍTICO en sendMessage:`);
        console.error(error.stack || error);
        res.status(500).json({ 
            message: 'Error al procesar tu mensaje. Intentá de nuevo.',
            debug: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = { sendMessage, clearSession, refreshModels };
