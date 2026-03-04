require('dotenv').config();
const pool = require('./config/db');

async function createLogsTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS activity_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                action VARCHAR(50) NOT NULL,
                entity VARCHAR(50) NOT NULL,
                entity_id INT NULL,
                details JSON NULL,
                ip_address VARCHAR(45) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_created_user (created_at DESC, user_id)
            );
        `);
        console.log("Tabla activity_logs creada o verificada.");
        process.exit(0);
    } catch (e) {
        console.error("Error creando tabla activity_logs:", e);
        process.exit(1);
    }
}

createLogsTable();
