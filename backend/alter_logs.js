require('dotenv').config();
const pool = require('./config/db');

async function alterLogsTable() {
    try {
        await pool.query(`
            ALTER TABLE activity_logs 
            ADD COLUMN space_id INT NULL AFTER entity_id;
        `);
        console.log("Columna space_id añadida a activity_logs.");
        process.exit(0);
    } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
            console.log("La columna space_id ya existe.");
            process.exit(0);
        } else {
            console.error("Error alterando tabla activity_logs:", e);
            process.exit(1);
        }
    }
}

alterLogsTable();
