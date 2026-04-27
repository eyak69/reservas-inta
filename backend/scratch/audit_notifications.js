const pool = require('../config/db');

async function audit() {
    try {
        const [rows] = await pool.query('SELECT * FROM notifications ORDER BY id DESC LIMIT 3');
        console.log('Últimas notificaciones en DB:', JSON.stringify(rows, null, 2));
        process.exit(0);
    } catch (err) {
        console.error('Error auditando:', err.message);
        process.exit(1);
    }
}

audit();
