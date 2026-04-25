// Aprende de conversaciones exitosas y mejora el system prompt con few-shot examples.
// Una interacción es "exitosa" si ejecutó tools sin error y el usuario no la corrigió.

const pool = require('../config/db');

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
        } else {
            await pool.query(
                `INSERT INTO chat_feedback (user_message, model_reply, tools_used, action_type, was_success)
                 VALUES (?, ?, ?, ?, TRUE)`,
                [userMessage.trim(), modelReply.trim(), JSON.stringify(toolsUsed), actionType]
            );
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

// Construye el bloque few-shot para el system prompt
async function buildFewShotBlock() {
    const examples = await getBestExamples(6);
    if (!examples.length) return '';

    const lines = examples.map(ex =>
        `Usuario: "${ex.user_message.slice(0, 120)}"\nAsistente: "${ex.model_reply.slice(0, 200)}"`
    ).join('\n\n');

    return `\nEJEMPLOS DE CONVERSACIONES EXITOSAS (aprendidas del uso real — seguí este patrón):\n${lines}\n`;
}

module.exports = { recordSuccess, recordCorrection, isCorrection, actionTypeFromTools, buildFewShotBlock };
