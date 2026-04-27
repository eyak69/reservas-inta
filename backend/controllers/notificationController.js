const pool = require('../config/db');

const getNotifications = async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ message: 'Usuario no autenticado' });
        }
        const userId = req.user.id;
        const isAdmin = req.user.role === 'admin';

        // Los admins ven notificaciones globales (user_id IS NULL) + las suyas
        // Los usuarios comunes solo ven las suyas (Regla 1)
        let sql = 'SELECT * FROM notifications WHERE (user_id = ? OR (user_id IS NULL AND ? = 1)) AND is_read = 0 ORDER BY created_at DESC LIMIT 50';
        const [rows] = await pool.query(sql, [userId, isAdmin ? 1 : 0]);
        
        res.json(rows);
    } catch (error) {
        console.error('[NotificationController] ❌ Error:', error);
        res.status(500).json({ 
            message: 'Error obteniendo notificaciones', 
            error: error.message,
            stack: process.env.NODE_ENV === 'production' ? null : error.stack 
        });
    }
};

const markAllAsRead = async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ message: 'Usuario no autenticado' });
        }
        const userId = req.user.id;
        const isAdmin = req.user.role === 'admin';

        let sql = 'UPDATE notifications SET is_read = 1 WHERE (user_id = ? OR (user_id IS NULL AND ? = 1))';
        await pool.query(sql, [userId, isAdmin ? 1 : 0]);
        
        res.json({ message: 'Notificaciones marcadas como leídas' });
    } catch (error) {
        console.error('[NotificationController] ❌ Error en markAllAsRead:', error);
        res.status(500).json({ message: 'Error actualizando notificaciones', error: error.message });
    }
};

module.exports = { getNotifications, markAllAsRead };
