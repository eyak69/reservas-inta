const { OpenAI } = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getActiveModels, recordResponseTime, recordError } = require('./modelDiscovery');
const { executeTool } = require('./chatTools');
const prompts = require('../config/chatPrompts');
const vectorService = require('./vectorService');
const pool = require('../config/db');

// Configuración de clientes (reutilizados del controlador original)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const groq = new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' });
const cerebras = new OpenAI({ apiKey: process.env.CEREBRAS_API_KEY, baseURL: 'https://api.cerebras.ai/v1' });

const STATIC_FALLBACK = [
    { provider: 'openai',   model: 'gpt-4o-mini'                    },
    { provider: 'gemini',   model: 'gemini-2.0-flash'               },
    { provider: 'cerebras', model: 'qwen-3-235b-a22b-instruct-2507' },
    { provider: 'groq',     model: 'llama-3.3-70b-versatile'        },
];

let MODELS_FALLBACK = [];

async function refreshModels() {
    try {
        const dbModels = await getActiveModels();
        MODELS_FALLBACK = dbModels.map(m => ({
            provider: m.provider,
            model: m.model
        }));
    } catch (e) {
        console.error('[ChatService] Error al refrescar modelos:', e.message);
    }
}
setInterval(refreshModels, 60 * 60 * 1000);
refreshModels();

async function processMessage(userId, userRole, userIp, message, history = []) {
    const ts = () => new Date().toLocaleString('es-AR', { 
        timeZone: 'America/Argentina/Buenos_Aires',
        hour12: false 
    });
    const reqId = Math.random().toString(36).substring(7);
    
    // 1. Preparar historial y contexto
    const prunedHistory = history.slice(-10); // Mantener últimos 5 pares
    const contents = [
        ...prunedHistory.map((turn, idx) => {
            const isOld = idx < prunedHistory.length - 4;
            return {
                role: turn.role,
                parts: [{ text: isOld ? '[Información antigua omitida]' : (turn.message || turn.text || '') }]
            };
        }),
        { role: 'user', parts: [{ text: message }] }
    ];

    // 2. Construir System Prompt dinámico
    const [[user]] = await pool.query('SELECT name, email, role FROM users WHERE id = ?', [userId]);
    const ahora = new Date().toLocaleString('es-AR', { 
        timeZone: 'America/Argentina/Buenos_Aires',
        hour12: false 
    });
    const esAdmin = userRole === 'admin';

    // Búsqueda Semántica para aprendizaje (Regla 6)
    let dynamicExamples = '';
    try {
        const results = await vectorService.searchSimilar(message, 3);
        if (results.length > 0) {
            dynamicExamples = "\nEJEMPLOS DE SITUACIONES PASADAS (Aprendizaje):\n" + 
                results.map(r => `- Usuario: "${r.user_message}" -> Respuesta sugerida: "${r.model_reply}"`).join('\n') + "\n";
        }
    } catch (e) {
        console.warn('[ChatService] Error en búsqueda semántica:', e.message);
    }

    const fullSystemPrompt = `
${prompts.PERSONALIDAD}

CONTEXTO ACTUAL:
- Usuario: ${user.name || 'Usuario'} (${user.email})
- Rol: ${userRole} ${esAdmin ? '(Administrador)' : '(Usuario Estándar)'}
- Fecha/Hora: ${ahora}
- Zona Horaria: America/Argentina/Buenos_Aires

REGLAS ADICIONALES (TELEGRAM):
- Podés generar códigos para que los usuarios vinculen su Telegram usando la herramienta 'generate_link_token'.
- Si el usuario pide conectar su cuenta o pide un código, usá esa tool y decile que mande el código al bot @intareservas_bot.

${prompts.REGLAS_GENERALES}
${esAdmin ? prompts.GUIA_ADMIN : prompts.GUIA_USUARIO}
${dynamicExamples}
${prompts.CHAIN_OF_THOUGHT}
`;

    let attempts = 0;
    let finalResponse = null;

    // Bucle de herramientas (max 5 turnos por seguridad)
    let toolTurns = 0;
    while (toolTurns < 5) {
        console.log(`[${ts()}] [ChatService:${reqId}] Turno IA #${toolTurns + 1}`);
        
        const aiResponse = await generateWithFallback(contents, fullSystemPrompt, userRole);
        
        // Guardar respuesta en el hilo para el siguiente turno
        contents.push({ role: 'model', parts: aiResponse.parts });

        // Escanear todas las partes de la respuesta (Regla 11: Resiliencia)
        const toolCalls = aiResponse.parts.filter(p => p.functionCall).map(p => p.functionCall);
        
        if (toolCalls.length === 0) {
            finalResponse = aiResponse.text;
            console.log(`[${ts()}] [ChatService:${reqId}] ✓ Respuesta final generada: "${finalResponse.slice(0, 100)}..."`);
            break;
        }

        // Ejecutar herramientas
        for (const call of toolCalls) {
            console.log(`[${ts()}] [ChatService:${reqId}] Ejecutando tool: ${call.name}`);
            const result = await executeTool(call.name, call.args, userId, userRole, userIp);
            contents.push({
                role: 'function',
                parts: [{ functionResponse: { name: call.name, response: result } }]
            });
        }
        toolTurns++;
    }

    return {
        text: finalResponse || 'Lo siento, no pude procesar tu solicitud tras varios intentos.',
        history: contents // Historial actualizado para guardar en DB
    };
}

async function generateWithFallback(contents, systemPrompt, userRole, fixedEntry = null) {
    let candidates = fixedEntry ? [fixedEntry] : (MODELS_FALLBACK.length > 0 ? MODELS_FALLBACK : STATIC_FALLBACK);
    let lastError = null;

    for (const entry of candidates) {
        try {
            let result;
            if (entry.provider === 'gemini') {
                result = await callGemini(entry.model, contents, systemPrompt);
            } else {
                const client = entry.provider === 'groq' ? groq : 
                               entry.provider === 'cerebras' ? cerebras : openai;
                result = await callOpenAI(entry.model, contents, systemPrompt, userRole, client);
            }
            return result;
        } catch (e) {
            lastError = e;
            console.warn(`[ChatService] Falló ${entry.provider}/${entry.model}: ${e.message}`);
            if (MODELS_FALLBACK.length > 1) {
                MODELS_FALLBACK = MODELS_FALLBACK.filter(m => !(m.provider === entry.provider && m.model === entry.model));
            }
        }
    }
    throw lastError;
}

async function callOpenAI(model, contents, systemPrompt, userRole, client = openai) {
    const messages = [{ role: 'system', content: systemPrompt }];
    const toolCallIds = new Map();
    contents.forEach((c, idx) => {
        c.parts.forEach((p, pIdx) => {
            if (p.text) {
                messages.push({ role: c.role === 'model' ? 'assistant' : 'user', content: p.text });
            }
            if (p.functionCall) {
                const callId = `call_${idx}_${pIdx}_${Math.random().toString(36).slice(2, 6)}`;
                toolCallIds.set(p.functionCall.name, callId);
                messages.push({ 
                    role: 'assistant', 
                    tool_calls: [{ 
                        id: callId, 
                        type: 'function', 
                        function: { 
                            name: p.functionCall.name, 
                            arguments: JSON.stringify(p.functionCall.args) 
                        } 
                    }] 
                });
            }
            if (p.functionResponse) {
                const callId = toolCallIds.get(p.functionResponse.name) || `call_orphan_${idx}_${pIdx}`;
                messages.push({ 
                    role: 'tool', 
                    tool_call_id: callId, 
                    content: JSON.stringify(p.functionResponse.response) 
                });
            }
        });
    });

    const { toolDeclarations } = require('./chatTools');
    const tools = toolDeclarations.map(t => ({
        type: 'function',
        function: {
            name: t.name,
            description: t.description,
            parameters: {
                type: 'object',
                properties: Object.fromEntries(Object.entries(t.parameters.properties).map(([k, v]) => [k, { type: v.type.toLowerCase(), description: v.description }])),
                required: t.parameters.required
            }
        }
    }));

    const response = await client.chat.completions.create({
        model,
        messages,
        tools,
        tool_choice: 'auto'
    });

    const choice = response.choices[0].message;
    const parts = [];
    if (choice.content) parts.push({ text: choice.content });
    if (choice.tool_calls) {
        const tc = choice.tool_calls[0].function;
        parts.push({ functionCall: { name: tc.name, args: JSON.parse(tc.arguments) } });
    }
    return { text: choice.content || '', parts };
}

async function callGemini(model, contents, systemPrompt) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const genModel = genAI.getGenerativeModel({ model, systemInstruction: systemPrompt });
    const { toolDeclarations } = require('./chatTools');
    
    const chat = genModel.startChat({
        history: contents.slice(0, -1).map(c => ({ role: c.role === 'model' ? 'model' : 'user', parts: c.parts })),
        tools: [{ functionDeclarations: toolDeclarations }]
    });

    const lastMsg = contents[contents.length - 1].parts[0].text;
    const result = await chat.sendMessage(lastMsg);
    const response = await result.response;
    return { text: response.text(), parts: response.candidates[0].content.parts };
}

module.exports = { processMessage };
