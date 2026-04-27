const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });
const pool = require('../backend/config/db');
const chatService = require('../backend/services/chatService');

async function runTest() {
    console.log('🚀 Iniciando Test de Flujo Telegram (Simulado)');
    console.log('--------------------------------------------');

    // 1. Buscar un usuario de prueba (usamos el id 12 o el primero que encontremos)
    const [users] = await pool.query('SELECT id, name, role, email FROM users LIMIT 1');
    if (users.length === 0) {
        console.error('❌ No hay usuarios en la BD para probar.');
        return;
    }
    const user = users[0];
    console.log(`👤 Probando con usuario: ${user.name} (${user.role})`);

    const testMessages = [
        "¿Qué salas hay disponibles hoy?",
        "Reservame la Sala 1 para hoy de 15:00 a 16:00 para una reunión técnica",
        "¿Qué reservas tengo pendientes?",
        "Cancelá la reserva que acabás de hacer"
    ];

    let history = [];

    for (const msg of testMessages) {
        console.log(`\n💬 USUARIO: "${msg}"`);
        
        try {
            // Simular rehidratación de historial como lo hace telegramService.js
            const [rows] = await pool.query(
                'SELECT role, message FROM chat_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 10',
                [user.id]
            );
            const currentHistory = rows.reverse().map(r => ({
                role: r.role === 'model' ? 'model' : 'user',
                message: r.message
            }));

            const result = await chatService.processMessage(
                user.id,
                user.role,
                'telegram_bot_test',
                msg,
                currentHistory
            );

            console.log(`🤖 LIDIA: "${result.text}"`);

            // Persistir (como lo hace el bot)
            await pool.query(
                'INSERT INTO chat_messages (user_id, session_id, role, message, model_used) VALUES (?, ?, "user", ?, "test"), (?, ?, "model", ?, "test")',
                [user.id, 'test_session', msg, user.id, 'test_session', result.text]
            );

        } catch (e) {
            console.error('❌ Error en el turno:', e);
        }
    }

    console.log('\n--------------------------------------------');
    console.log('✅ Test Finalizado');
    process.exit(0);
}

runTest();
