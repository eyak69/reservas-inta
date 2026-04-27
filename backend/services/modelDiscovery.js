// Descubre modelos disponibles en cada proveedor al arrancar y los sincroniza en ai_models.
// El ranking se calcula con: velocidad del proveedor (tok/s) + tamaño del modelo (contexto/output).

const pool = require('../config/db');

// Velocidad aproximada publicada por proveedor (tokens/seg). Cerebras >> Groq >> Gemini.
const PROVIDER_SPEED = { cerebras: 2000, groq: 800, gemini: 200, openai: 100 };

// Modelos excluidos: audio, TTS, embeddings, guardrails, moderación, visión pura, etc.
const EXCLUDE_PATTERNS = [
    /whisper/i, /tts/i, /embed/i, /guard/i, /safeguard/i,
    /audio/i, /realtime/i, /transcribe/i, /diarize/i,
    /arabic/i, /orpheus/i, /allam/i, /compound/i, /prompt-guard/i,
    /vision/i, /imagen/i, /aqa/i,
];

// Modelos confirmados que NO soportan function calling correctamente
const EXCLUDE_MODELS = new Set([
    'llama3.1-8b',            // Cerebras — devuelve JSON crudo en vez de ejecutar tools
    'llama-3.1-8b-instant',   // Groq — mismo problema
    'openai/gpt-oss-20b',     // Groq — respuesta vacía con tools
    'openai/gpt-oss-120b',    // Groq — respuesta vacía con tools
    'zai-glm-4.7',            // Cerebras — 404
    'gpt-oss-120b',           // Cerebras — 404
]);

// Modelos de Gemini que rompen function calling (thinking/preview/exp/latest)
const GEMINI_EXCLUDE = /thinking|preview|exp|latest|vision|imagen|aqa/i;

function isUsable(modelId, provider) {
    if (EXCLUDE_MODELS.has(modelId)) return false;
    if (EXCLUDE_PATTERNS.some(p => p.test(modelId))) return false;
    if (provider === 'gemini' && GEMINI_EXCLUDE.test(modelId)) return false;
    return true;
}

// Calcula prioridad: menor = mejor. Combina velocidad del proveedor y capacidad del modelo.
// score = 10000 - (tokens_per_sec * 0.5) - (context_window / 1000) - (max_output / 100)
// Así un modelo rápido con contexto grande queda primero.
function calcPriority(provider, contextWindow, maxOutput) {
    const speed = PROVIDER_SPEED[provider] ?? 100;
    const ctx   = contextWindow ?? 4096;
    const out   = maxOutput     ?? 1024;
    const score = 10000 - (speed * 0.5) - (ctx / 1000) - (out / 100);
    return Math.round(Math.max(1, score));
}

function calcIntelligence(modelId) {
    const id = modelId.toLowerCase();
    if (id.includes('gpt-4o') && !id.includes('mini')) return 100;
    if (id.includes('llama-4')) return 98;
    if (id.includes('llama-3.3-70b')) return 95;
    if (id.includes('qwen') && id.includes('235b')) return 95;
    if (id.includes('pro')) return 95;
    if (id.includes('gpt-4o-mini')) return 85;
    if (id.includes('flash')) return 85;
    if (id.includes('qwen') && id.includes('32b')) return 80;
    if (id.includes('llama-3.1-70b')) return 90;
    if (id.includes('8b') || id.includes('1b') || id.includes('3b')) return 40; // Los "pelotudos"
    return 60; // Por defecto medio
}

async function fetchGroqModels(apiKey) {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.data
        .filter(m => m.active && isUsable(m.id, 'groq'))
        .map(m => ({
            model_id:         m.id,
            context_window:   m.context_window   ?? null,
            max_output_tokens: m.max_completion_tokens ?? null,
            tokens_per_sec:   PROVIDER_SPEED.groq,
        }));
}

async function fetchCerebrasModels(apiKey) {
    const res = await fetch('https://api.cerebras.ai/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.data
        .filter(m => isUsable(m.id, 'cerebras'))
        .map(m => ({
            model_id:          m.id,
            context_window:    m.context_window    ?? null,
            max_output_tokens: m.max_output_tokens ?? null,
            tokens_per_sec:    PROVIDER_SPEED.cerebras,
        }));
}

async function fetchGeminiModels(apiKey) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data.models || [])
        .filter(m =>
            m.supportedGenerationMethods?.includes('generateContent') &&
            isUsable(m.name, 'gemini') &&
            /flash|pro/.test(m.name)
        )
        .map(m => ({
            model_id:          m.name.replace('models/', ''),
            context_window:    m.inputTokenLimit  ?? null,
            max_output_tokens: m.outputTokenLimit ?? null,
            tokens_per_sec:    PROVIDER_SPEED.gemini,
        }));
}

async function fetchOpenAIModels(apiKey) {
    const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.data
        .filter(m => m.id.startsWith('gpt-4o') && isUsable(m.id, 'openai'))
        .map(m => ({
            model_id:         m.id,
            context_window:   128000,
            max_output_tokens: 4096,
            tokens_per_sec:   PROVIDER_SPEED.openai,
        }));
}

async function syncModels(provider, models, conn) {
    for (const m of models) {
        const priority = calcPriority(provider, m.context_window, m.max_output_tokens);
        const intelligence = calcIntelligence(m.model_id);
        await conn.query(
            `INSERT INTO ai_models (provider, model_id, is_active, priority, intelligence_score, context_window, max_output_tokens, tokens_per_sec)
             VALUES (?, ?, TRUE, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               is_active          = TRUE,
               priority           = VALUES(priority),
               intelligence_score = VALUES(intelligence_score),
               context_window     = VALUES(context_window),
               max_output_tokens  = VALUES(max_output_tokens),
               tokens_per_sec     = VALUES(tokens_per_sec),
               updated_at         = NOW()`,
            [provider, m.model_id, priority, intelligence, m.context_window, m.max_output_tokens, m.tokens_per_sec]
        );
    }
}

async function discoverModels() {
    console.log('[ModelDiscovery] Iniciando descubrimiento de modelos...');
    const conn = await pool.getConnection();

    const results  = {};
    const errors   = [];
    const fetchers = [
        { provider: 'cerebras', fn: () => fetchCerebrasModels(process.env.CEREBRAS_API_KEY) },
        { provider: 'groq',     fn: () => fetchGroqModels(process.env.GROQ_API_KEY)         },
        { provider: 'gemini',   fn: () => fetchGeminiModels(process.env.GEMINI_API_KEY)      },
        { provider: 'openai',   fn: () => fetchOpenAIModels(process.env.OPENAI_API_KEY)      },
    ];

    await Promise.all(fetchers.map(async ({ provider, fn }) => {
        try {
            results[provider] = await fn();
        } catch (e) {
            errors.push(`${provider}: ${e.message}`);
            console.warn(`[ModelDiscovery] ⚠ Error consultando ${provider}: ${e.message}`);
            results[provider] = [];
        }
    }));

    try {
        // Primero pausar todos; luego reactivar solo los encontrados
        await conn.query(`UPDATE ai_models SET is_active = FALSE`);

        for (const [provider, models] of Object.entries(results)) {
            if (!models.length) continue;
            await syncModels(provider, models, conn);
            const ids = models.map(m => m.model_id).join(', ');
            console.log(`[ModelDiscovery] ✓ ${provider}: ${models.length} modelos → ${ids}`);
        }

        if (errors.length) console.warn(`[ModelDiscovery] Errores parciales: ${errors.join(' | ')}`);
        console.log('[ModelDiscovery] ✓ Sincronización completa.');
    } finally {
        conn.release();
    }
}

// Manda un mensaje corto a todos los modelos activos en paralelo y registra su tiempo de respuesta.
// Se llama una vez al arrancar en background — no bloquea el servidor.
async function benchmarkModels() {
    const [rows] = await pool.query(
        `SELECT provider, model_id FROM ai_models WHERE is_active = TRUE`
    );
    if (!rows.length) return;

    console.log(`[ModelDiscovery] Iniciando benchmark de ${rows.length} modelos...`);

    const OpenAI = require('openai');
    const { GoogleGenAI } = require('@google/genai');

    const groq     = new OpenAI({ apiKey: process.env.GROQ_API_KEY,     baseURL: 'https://api.groq.com/openai/v1' });
    const cerebras = new OpenAI({ apiKey: process.env.CEREBRAS_API_KEY, baseURL: 'https://api.cerebras.ai/v1'    });
    const openai   = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const gemini   = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const PROMPT = [{ role: 'user', content: 'Respondé solo "ok".' }];

    async function pingModel(provider, modelId) {
        const t0 = Date.now();
        try {
            let hasContent = false;
            if (provider === 'gemini') {
                const r = await gemini.models.generateContent({
                    model: modelId,
                    contents: [{ role: 'user', parts: [{ text: 'Respondé solo "ok".' }] }],
                    config: { tools: [] }
                });
                hasContent = !!r.candidates?.[0]?.content?.parts?.[0]?.text;
            } else {
                const client = provider === 'groq' ? groq : 
                               provider === 'cerebras' ? cerebras : 
                               provider === 'openai' ? openai : null;
                if (!client) return;
                const r = await client.chat.completions.create({ model: modelId, messages: PROMPT, max_tokens: 5 });
                hasContent = !!r.choices?.[0]?.message?.content;
            }
            const ms = Date.now() - t0;
            if (hasContent) {
                await recordResponseTime(provider, modelId, ms);
                console.log(`[Benchmark] ✓ ${provider}/${modelId} → ${ms}ms`);
            } else {
                console.warn(`[Benchmark] ✗ ${provider}/${modelId} → respuesta vacía (${ms}ms)`);
                await recordError(provider, modelId, 'respuesta vacía en benchmark');
            }
        } catch (e) {
            const msg = e.message || '';
            console.warn(`[Benchmark] ✗ ${provider}/${modelId} → ${msg.slice(0, 60)}`);
            // Si agotó quota, desactivar temporalmente para que no sea elegido
            if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
                await pool.query(
                    `UPDATE ai_models SET is_active = FALSE, last_error = ?, error_at = NOW()
                     WHERE provider = ? AND model_id = ?`,
                    [msg.slice(0, 2000), provider, modelId]
                );
                console.warn(`[Benchmark] ⏸ ${provider}/${modelId} desactivado por quota agotada`);
            }
        }
    }

    // Cerebras y Groq en paralelo (rápidos, sin límite estricto de RPM)
    const fast = rows.filter(r => r.provider !== 'gemini');
    const geminis = rows.filter(r => r.provider === 'gemini');

    await Promise.all(fast.map(r => pingModel(r.provider, r.model_id)));

    // Gemini secuencial con delay para no quemar la quota (15 RPM free tier)
    for (const r of geminis) {
        await pingModel(r.provider, r.model_id);
        await new Promise(res => setTimeout(res, 4500)); // 4.5s entre calls → ~13 RPM
    }

    console.log('[ModelDiscovery] ✓ Benchmark completo.');
}

async function getActiveModels() {
    const [rows] = await pool.query(
        `SELECT provider, model_id FROM ai_models
         WHERE is_active = TRUE
         ORDER BY
           intelligence_score DESC,
           CASE WHEN last_error IS NOT NULL THEN 1 ELSE 0 END ASC,
           CASE WHEN avg_response_ms IS NULL THEN 1 ELSE 0 END ASC,
           avg_response_ms ASC`
    );
    return rows.map(r => ({ provider: r.provider, model: r.model_id }));
}

// Actualiza el promedio móvil de tiempo de respuesta (weighted moving average, peso 10)
async function recordResponseTime(provider, modelId, responseMs) {
    try {
        await pool.query(
            `UPDATE ai_models
             SET
               avg_response_ms = CASE
                 WHEN avg_response_ms IS NULL THEN ?
                 ELSE ROUND((avg_response_ms * LEAST(call_count, 9) + ?) / (LEAST(call_count, 9) + 1))
               END,
               call_count  = call_count + 1,
               last_error  = NULL,
               error_at    = NULL
             WHERE provider = ? AND model_id = ?`,
            [responseMs, responseMs, provider, modelId]
        );
    } catch (e) {
        console.warn(`[ModelDiscovery] No se pudo registrar tiempo de respuesta: ${e.message}`);
    }
}

async function recordError(provider, modelId, errorMsg) {
    try {
        await pool.query(
            `UPDATE ai_models SET last_error = ?, error_at = NOW()
             WHERE provider = ? AND model_id = ?`,
            [errorMsg.slice(0, 2000), provider, modelId]
        );
    } catch (e) {
        console.warn(`[ModelDiscovery] No se pudo registrar error: ${e.message}`);
    }
}

module.exports = { discoverModels, benchmarkModels, getActiveModels, recordResponseTime, recordError };
