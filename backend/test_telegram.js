require('dotenv').config();
const pool = require('./config/db');
const chatService = require('./services/chatService');

async function runTest() {
    console.log('🚀 Iniciando Test de Flujo Telegram (Simulado)');
    console.log('--------------------------------------------');

    // 1. Buscar un usuario de prueba
    const [users] = await pool.query('SELECT id, name, role, email FROM users WHERE is_active = 1 LIMIT 1');
    if (users.length === 0) {
        console.error('❌ No hay usuarios activos en la BD para probar.');
        return;
    }
    const user = users[0];
    console.log(`👤 Probando con usuario: ${user.name} (${user.role})`);

    const testMessages = [
        "¿Qué salas hay disponibles hoy?",
        "Reservame la Sala 1 para hoy de 22:00 a 23:00 para una reunión de prueba",
        "¿Qué reservas tengo pendientes?",
        "Cancelá la reserva que acabás de hacer"
    ];

    for (const msg of testMessages) {
        console.log(`\n💬 USUARIO: "${msg}"`);
        
        try {
            // Rehidratar Historial (Memoria)
            const [rows] = await pool.query(
                'SELECT role, message FROM chat_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 10',
                [user.id]
            );
            const history = rows.reverse().map(r => ({
                role: r.role === 'model' ? 'model' : 'user',
                message: r.message
            }));

            const result = await chatService.processMessage(
                user.id,
                user.role,
                'telegram_bot_test',
                msg,
                history
            );

            console.log(`🤖 LIDIA: "${result.text}"`);

            // Persistir
            await pool.query(
                'INSERT INTO chat_messages (user_id, session_id, role, message, model_used) VALUES (?, ?, "user", ?, "test"), (?, ?, "model", ?, "test")',
                [user.id, 'test_tg', msg, user.id, 'test_tg', result.text]
            );

        } catch (e) {
            console.error('❌ Error en el turno:', e.message);
        }
    }

    console.log('\n--------------------------------------------');
    console.log('✅ Test Finalizado');
    process.exit(0);
}

runTest();
