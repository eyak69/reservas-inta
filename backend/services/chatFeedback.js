// Aprende de conversaciones exitosas y mejora el system prompt con few-shot examples.
// Una interacción es "exitosa" si ejecutó tools sin error y el usuario no la corrigió.

const pool = require('../config/db');
const vectorService = require('./vectorService');
const auditService = require('./auditService');
const { TOOL_SCHEMAS } = require('./chatTools'); // Para darle contexto de herramientas al auditor

// Palabras que indican que el usuario está corrigiendo o quejándose
const CORRECTION_SIGNALS = [
    'no era', 'no es eso', 'no quería', 'te equivocaste', 'mal', 'error',
    'no eso', 'incorrecto', 'no', 'para', 'stop', 'olvidá', 'dejalo',
    'no así', 'no de esa', 'otro', 'otra'
];

function isCorrection(text) {
    const lower = text.toLowerCase();
    return CORRECTION_SIGNALS.some(s => lower.includes(s));
}

// Mapea el nombre de la tool al tipo de acción para agrupar ejemplos
function actionTypeFromTools(tools) {
    if (!tools?.length) return null;
    if (tools.includes('cancelar_reserva'))          return 'cancelar_reserva';
    if (tools.includes('crear_reserva'))             return 'crear_reserva';
    if (tools.includes('aprobar_rechazar_reserva'))  return 'aprobar_rechazar';
    if (tools.includes('mis_reservas'))              return 'consultar_reservas';
    if (tools.includes('gestionar_usuario'))         return 'gestionar_usuario';
    if (tools.includes('gestionar_espacio'))         return 'gestionar_espacio';
    if (tools.includes('listar_espacios'))           return 'listar_espacios';
    return 'general';
}

// Registra un intercambio exitoso. Si ya existe un ejemplo similar, incrementa times_seen.
async function recordSuccess(userMessage, modelReply, toolsUsed) {
    const actionType = actionTypeFromTools(toolsUsed);
    if (!actionType) return;

    try {
        // Normalizar el mensaje para agrupar variantes similares
        const normalized = userMessage.trim().toLowerCase().slice(0, 200);

        const [existing] = await pool.query(
            `SELECT id, times_seen FROM chat_feedback
             WHERE action_type = ? AND was_success = TRUE
             AND LOWER(LEFT(user_message, 200)) = ?
             LIMIT 1`,
            [actionType, normalized]
        );

        if (existing.length) {
            await pool.query(
                `UPDATE chat_feedback SET times_seen = times_seen + 1, updated_at = NOW() WHERE id = ?`,
                [existing[0].id]
            );
            // Opcional: Re-vectorizar si es necesario, pero con una vez basta
        } else {
            const [result] = await pool.query(
                `INSERT INTO chat_feedback (user_message, model_reply, tools_used, action_type, was_success)
                 VALUES (?, ?, ?, ?, TRUE)`,
                [userMessage.trim(), modelReply.trim(), JSON.stringify(toolsUsed), actionType]
            );
            
            // 🔥 Indexación Semántica en Qdrant (Fire and Forget)
            vectorService.upsertFeedback(result.insertId, userMessage, modelReply, actionType)
                .catch(err => console.error('[ChatFeedback] Error indexando en Qdrant:', err.message));
        }
    } catch (e) {
        console.warn('[ChatFeedback] Error guardando éxito:', e.message);
    }
}

// Marca el último ejemplo del mismo tipo como fallido si el usuario corrige
async function recordCorrection(userMessage, actionType) {
    if (!actionType) return;
    try {
        await pool.query(
            `UPDATE chat_feedback SET was_success = FALSE
             WHERE action_type = ? AND was_success = TRUE
             ORDER BY updated_at DESC LIMIT 1`,
            [actionType]
        );

        // 🔥 Lanzar Auditoría de Autocorrección (Background)
        // Buscamos el último mensaje del bot para darle contexto al auditor
        const [lastMessages] = await pool.query(
            `SELECT message FROM chat_messages WHERE role = 'model' ORDER BY id DESC LIMIT 1`
        );
        const lastBotReply = lastMessages.length ? lastMessages[0].message : "Desconocida";
        
        const toolsContext = JSON.stringify(TOOL_SCHEMAS.map(t => t.function.name));

        auditService.auditInteraction(
            "Mensaje previo del usuario", 
            lastBotReply, 
            userMessage, 
            toolsContext
        ).catch(err => console.error('[ChatFeedback] Error lanzando auditoría:', err.message));

    } catch (e) {
        console.warn('[ChatFeedback] Error registrando corrección:', e.message);
    }
}

// Devuelve los mejores ejemplos por tipo de acción para inyectar en el system prompt
async function getBestExamples(limit = 6) {
    try {
        const [rows] = await pool.query(
            `SELECT action_type, user_message, model_reply, times_seen
             FROM chat_feedback
             WHERE was_success = TRUE
             ORDER BY times_seen DESC, updated_at DESC
             LIMIT ?`,
            [limit]
        );
        return rows;
    } catch (e) {
        console.warn('[ChatFeedback] Error obteniendo ejemplos:', e.message);
        return [];
    }
}

// Construye el bloque few-shot para el system prompt usando búsqueda semántica
async function buildFewShotBlock(currentUserMessage = null) {
    let examples = [];

    // 1. Intentar búsqueda semántica si hay un mensaje del usuario
    if (currentUserMessage) {
        examples = await vectorService.searchSimilar(currentUserMessage, 4);
    }

    // 2. Si no hay resultados semánticos (o es la primera vez), usar los más populares como fallback
    if (examples.length < 2) {
        const popular = await getBestExamples(4);
        // Combinar evitando duplicados si fuera necesario (simplificado aquí)
        examples = [...examples, ...popular].slice(0, 5);
    }

    if (examples.length === 0) return '';

    const block = examples.map((ex, i) => `
<ejemplo_de_aprendizaje id="${i+1}">
USUARIO: "${ex.user_message}"
RESPUESTA IDEAL: "${ex.model_reply}"
</ejemplo_de_aprendizaje>`).join('\n');

    return `
MEMORIA DE APRENDIZAJE (Casos de éxito pasados):
Estos son ejemplos de cómo debés responder en situaciones similares. 
ATENCIÓN: Son solo ejemplos de estilo y razonamiento. NO asumas que los datos (IDs, fechas, salas) de estos ejemplos son reales para la conversación actual. Basate siempre en los resultados de tus TOOLS actuales.

${block}
`;
}

module.exports = { recordSuccess, recordCorrection, isCorrection, actionTypeFromTools, buildFewShotBlock };
