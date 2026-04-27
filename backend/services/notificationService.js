const pool = require('../config/db');
const { sendNotification, notifyAdmins } = require('./telegramService');

let io; // Instancia de socket.io

function initSocket(socketIoInstance) {
    io = socketIoInstance;
    
    io.on('connection', (socket) => {
        console.log(`[Socket] 🔌 Conexión establecida: ${socket.id}`);
        
        socket.on('authenticate', (data) => {
            console.log(`[Socket] 🔑 Intento de auth: User ${data.userId}, Role: ${data.role}`);
            if (data.role === 'admin') {
                socket.join('admins');
                const admins = Array.from(io.sockets.adapter.rooms.get('admins') || []);
                console.log(`[Socket] 🔐 Admin conectado (${socket.id}). Sala 'admins' actual:`, admins);
            }
        });

        socket.on('disconnect', (reason) => {
            console.log(`[Socket] 🔌 Desconectado: ${socket.id}. Razón: ${reason}`);
        });
    });
}

/**
 * Envía una notificación a un usuario o a todos los administradores
 * @param {Object} params - { userId, title, message, type, toAdmins, telegram }
 */
async function sendNotificationEvent({ userId = null, title, message, type = 'info', toAdmins = false, telegram = true }) {
    try {
        // 1. Persistir en DB (Regla 4)
        const [result] = await pool.query(
            'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
            [userId, title, message, type]
        );
        const notificationId = result.insertId;

        const payload = {
            id: notificationId,
            title,
            message,
            type,
            created_at: new Date()
        };

        // 2. Enviar por Socket.io (Tiempo Real)
        if (io) {
            if (toAdmins) {
                const adminCount = io.sockets.adapter.rooms.get('admins')?.size || 0;
                console.log(`[NotificationService] 📢 Emitiendo a 'admins' (${adminCount} conectados)`);
                io.to('admins').emit('notification', payload);
            } else if (userId) {
                // En un sistema real buscaríamos el socket específico del usuario, 
                // por ahora emitimos a todos y el front filtra o usamos salas por user_id
                io.emit(`notification_${userId}`, payload); 
            }
        }

        // 3. Enviar por Telegram (Omnicanalidad) - Aislamiento de Fallos (Regla 11)
        if (telegram) {
            try {
                if (toAdmins) {
                    await notifyAdmins(`🔔 *${title}*\n${message}`);
                } else if (userId) {
                    await sendNotification(userId, `🔔 *${title}*\n${message}`);
                }
            } catch (tgError) {
                console.error('[NotificationService] ⚠️ Falló el envío a Telegram, pero la notificación web continúa:', tgError.message);
                // Aquí se podría implementar un Exponential Backoff o cola de reintentos
            }
        }

        return notificationId;
    } catch (error) {
        console.error('[NotificationService] ❌ Error enviando notificación:', error.message);
    }
}

module.exports = { initSocket, sendNotificationEvent };
