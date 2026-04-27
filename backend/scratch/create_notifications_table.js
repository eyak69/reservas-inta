const pool = require('../config/db');

async function createTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NULL,
                title VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                type VARCHAR(50) DEFAULT 'info',
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (user_id),
                INDEX (is_read)
            )
        `);
        console.log('✅ Tabla "notifications" creada exitosamente.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error creando la tabla:', err.message);
        process.exit(1);
    }
}

createTable();
