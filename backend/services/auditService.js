const { GoogleGenerativeAI } = require('@google/generative-ai');
const vectorService = require('./vectorService');
const prompts = require('../config/chatPrompts');
const pool = require('../config/db');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Usamos el modelo más potente para auditar
const auditorModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

/**
 * Servicio encargado de analizar fallas y generar "Ejemplos de Oro" para el aprendizaje.
 */
class AuditService {
    
    /**
     * Audita una interacción fallida
     * @param {string} userMessage - El mensaje original del usuario
     * @param {string} failedReply - La respuesta del bot que no gustó
     * @param {string} correctionMessage - Lo que dijo el usuario para corregir (opcional)
     * @param {string} contextInfo - Información extra de las herramientas disponibles
     */
    async auditInteraction(userMessage, failedReply, correctionMessage = "", toolsAvailable = "") {
        console.log(`[AuditService] 🧠 Iniciando auditoría de falla...`);
        
        const prompt = `
Actuá como un Arquitecto de Software Senior y Experto en UX para el INTA. 
Tu tarea es auditar una falla de nuestro Asistente de IA y generar la "Respuesta Perfecta" para que el sistema aprenda de su error.

CONTEXTO DEL SISTEMA:
- El asistente ayuda a reservar espacios en el INTA.
- Personalidad: Rioplatense, amable, eficiente.
- Herramientas disponibles: ${toolsAvailable}

LA FALLA:
1. Mensaje del Usuario: "${userMessage}"
2. Respuesta fallida del Asistente: "${failedReply}"
3. Corrección/Queja del Usuario: "${correctionMessage}"

TU TAREA:
1. Analizá por qué falló el asistente (¿No usó la tool correcta? ¿Entendió mal la fecha? ¿Fue grosero?).
2. Escribí cómo debería haber sido la INTERACCIÓN PERFECTA.
3. Formateá tu respuesta EXACTAMENTE como este JSON (sin markdown, solo el JSON):
{
  "analisis": "Breve explicación de la falla",
  "intencion_real": "Lo que el usuario realmente quería hacer",
  "respuesta_perfecta": "La respuesta ideal que el bot debería haber dado, incluyendo el uso de herramientas si corresponde",
  "tipo_accion": "El nombre de la tool que debería haber usado"
}
`;

        try {
            const result = await auditorModel.generateContent(prompt);
            const responseText = result.response.text();
            
            // Limpiar posible markdown si el modelo se olvida
            const jsonStr = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            const goldStandard = JSON.parse(jsonStr);

            console.log(`[AuditService] ✓ Auditoría completada: ${goldStandard.analisis}`);

            // Guardar este "Ejemplo de Oro" en la base de datos de aprendizaje
            const [dbResult] = await pool.query(
                `INSERT INTO chat_feedback (user_message, model_reply, action_type, was_success, times_seen)
                 VALUES (?, ?, ?, TRUE, 5)`, // Le damos un peso inicial de 5 para que tenga prioridad
                [goldStandard.intencion_real || userMessage, goldStandard.respuesta_perfecta, goldStandard.tipo_accion]
            );

            // Indexar en Qdrant para memoria semántica inmediata
            await vectorService.upsertFeedback(
                dbResult.insertId, 
                goldStandard.intencion_real || userMessage, 
                goldStandard.respuesta_perfecta, 
                goldStandard.tipo_accion
            );

            return goldStandard;

        } catch (error) {
            console.error('[AuditService] ✗ Error en auditoría:', error.message);
            return null;
        }
    }
}

module.exports = new AuditService();
