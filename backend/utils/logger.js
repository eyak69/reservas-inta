const pool = require('../config/db');

/**
 * Registra una acción en la base de datos de forma asincrónica.
 * @param {Number} userId - ID del usuario
 * @param {String} action - Acción
 * @param {String} entity - Entidad
 * @param {Number|null} entityId - ID de la entidad afectada
 * @param {Number|null} spaceId - ID del espacio relacionado
 * @param {Object} details - Datos extra
 * @param {String} ipAddress - IP
 */
async function logActivity(userId, action, entity, entityId = null, spaceId = null, details = {}, ipAddress = null) {
    try {
        await pool.query(
            'INSERT INTO activity_logs (user_id, action, entity, entity_id, space_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [userId, action, entity, entityId, spaceId, JSON.stringify(details), ipAddress]
        );
    } catch (error) {
        console.error('Fallo al registrar auditoría en activity_logs:', error);
    }
}

module.exports = logActivity;
