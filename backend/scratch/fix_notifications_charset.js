const pool = require('../config/db');

async function fixCharset() {
    try {
        // Cambiar la base de datos completa a utf8mb4 si no lo está
        await pool.query('ALTER DATABASE reservas_inta CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci');
        
        // Cambiar la tabla notifications
        await pool.query('ALTER TABLE notifications CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        
        console.log('✅ Base de datos y tabla "notifications" actualizadas a utf8mb4 (Soporte para Emojis).');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error actualizando charset:', err.message);
        process.exit(1);
    }
}

fixCharset();
