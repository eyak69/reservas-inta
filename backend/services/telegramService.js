const { Telegraf } = require('telegraf');
const pool = require('../config/db');
const chatService = require('./chatService');

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    console.warn('[TelegramBot] ⚠️ No se encontró TELEGRAM_BOT_TOKEN. El bot no se iniciará.');
}

const bot = new Telegraf(token);

// Middleware de diagnóstico (Regla 11)
bot.use(async (ctx, next) => {
    if (ctx.message) {
        console.log(`[Telegram] 📥 Mensaje de ${ctx.from.first_name}: "${ctx.message.text || '[sin texto]'}"`);
    }
    return next();
});

// Middleware para verificar vinculación
async function getLinkedUser(ctx) {
    const telegramId = ctx.from.id.toString();
    const [rows] = await pool.query(
        'SELECT user_id FROM external_identities WHERE provider = "telegram" AND external_id = ?',
        [telegramId]
    );
    return rows.length > 0 ? rows[0].user_id : null;
}

// Lógica central de vinculación (soporta /vincular y Deep Linking)
async function handleLink(ctx, token) {
    if (!token) return ctx.reply('⚠️ Por favor, ingresá el código: /vincular CODIGO123');

    try {
        const [users] = await pool.query(
            'SELECT id FROM users WHERE link_token = ? AND link_token_expiry > ?',
            [token, new Date()]
        );

        if (users.length === 0) {
            return ctx.reply('❌ Código inválido o expirado. Generá uno nuevo en la web.');
        }

        const userId = users[0].id;
        const telegramId = ctx.from.id.toString();

        await pool.query(
            'INSERT INTO external_identities (user_id, provider, external_id) VALUES (?, "telegram", ?) ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)',
            [userId, telegramId]
        );

        // Limpiar el token usado
        await pool.query('UPDATE users SET link_token = NULL WHERE id = ?', [userId]);

        ctx.reply('✅ ¡Cuenta vinculada con éxito! Ya podés pedirme que haga reservas por vos.');
    } catch (error) {
        console.error('[TelegramBot] Error en vinculación:', error);
        ctx.reply('🔥 Hubo un error técnico. Reintentá en unos minutos.');
    }
}

// Comando de inicio (Soporta Deep Linking: t.me/bot?start=TOKEN)
bot.start((ctx) => {
    if (ctx.payload) {
        return handleLink(ctx, ctx.payload);
    }
    ctx.reply('¡Hola! Soy el asistente de Reservas INTA. 🤖\n\nPara empezar a usarme, necesito vincular tu cuenta de Telegram con tu usuario de la plataforma.\n\nEscribí: /vincular [tu_codigo]\n\n(Podés obtener tu código en la sección de perfil de la web).');
});

// Comando de vinculación manual
bot.command('vincular', (ctx) => {
    const token = ctx.message.text.split(' ')[1];
    return handleLink(ctx, token);
});

// Manejo de mensajes de texto
bot.on('text', async (ctx) => {
    // Ignorar si es un comando ya manejado
    if (ctx.message.text.startsWith('/')) return;

    const userId = await getLinkedUser(ctx);
    if (!userId) {
        return ctx.reply('⚠️ No tenés tu cuenta vinculada. Usá /vincular [tu_codigo] para empezar.');
    }

    // Mostrar que la IA está "pensando"
    await ctx.sendChatAction('typing');

    try {
        // 1. Obtener rol y datos del usuario
        const [[user]] = await pool.query('SELECT role, email FROM users WHERE id = ?', [userId]);
        
        // 2. Rehidratar Historial desde DB (Memoria de Lidia) - Regla 11
        const [rows] = await pool.query(
            `SELECT role, message FROM chat_messages 
             WHERE user_id = ? 
             ORDER BY created_at DESC LIMIT 10`,
            [userId]
        );

        const history = rows.reverse().map(r => ({
            role: r.role === 'model' ? 'model' : 'user',
            message: r.message
        }));

        const sessionId = `tg_${ctx.from.id}`;
        
        // 3. Procesar con Lidia
        const { text: aiResponse } = await chatService.processMessage(
            userId,
            user.role,
            'telegram_bot',
            ctx.message.text,
            history
        );

        // 4. Persistir la conversación (Regla 4)
        await pool.query(
            `INSERT INTO chat_messages (user_id, session_id, role, message, model_used)
             VALUES (?, ?, "user", ?, "telegram"), (?, ?, "model", ?, "telegram")`,
            [userId, sessionId, ctx.message.text, userId, sessionId, aiResponse]
        );

        await ctx.reply(aiResponse);
    } catch (error) {
        console.error('[TelegramBot] Error procesando mensaje:', error);
        ctx.reply('🤯 Me mareé un poco intentando procesar eso. ¿Podrías repetirlo?');
    }
});

function initTelegram() {
    if (!token) return;
    bot.launch()
        .then(() => console.log('[TelegramBot] 🚀 Bot iniciado con éxito'))
        .catch(err => console.error('[TelegramBot] ✗ Error al iniciar bot:', err));

    // Enable graceful stop
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
}



async function sendNotification(userId, message) {
    if (!token) return;
    try {
        const [rows] = await pool.query(
            'SELECT external_id FROM external_identities WHERE provider = "telegram" AND user_id = ?',
            [userId]
        );
        if (rows.length > 0) {
            const telegramId = rows[0].external_id;
            await bot.telegram.sendMessage(telegramId, message);
            console.log(`[TelegramBot] 🔔 Notificación enviada al usuario ${userId}`);
        }
    } catch (error) {
        console.error(`[TelegramBot] ❌ Error enviando notificación al usuario ${userId}:`, error.message);
    }
}

async function notifyAdmins(message) {
    if (!token) return;
    try {
        const [admins] = await pool.query(
            `SELECT ei.external_id 
             FROM external_identities ei
             JOIN users u ON ei.user_id = u.id
             WHERE ei.provider = "telegram" AND u.role = "admin"`
        );

        for (const admin of admins) {
            await bot.telegram.sendMessage(admin.external_id, message);
        }
        if (admins.length > 0) {
            console.log(`[TelegramBot] 📢 Notificación enviada a ${admins.length} administradores.`);
        }
    } catch (error) {
        console.error('[TelegramBot] ❌ Error notificando a los administradores:', error.message);
    }
}

module.exports = { initTelegram, sendNotification, notifyAdmins };
