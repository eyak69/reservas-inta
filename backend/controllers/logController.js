const pool = require('../config/db');

// Obtener los logs de auditoria (Protegido para Admin) con paginación
const getLogs = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const { startDate, endDate, userSearch, action } = req.query;
        let whereClauses = [];
        let params = [];

        if (startDate) {
            whereClauses.push("l.created_at >= ?");
            params.push(`${startDate} 00:00:00`);
        }
        if (endDate) {
            whereClauses.push("l.created_at <= ?");
            params.push(`${endDate} 23:59:59`);
        }
        if (userSearch) {
            whereClauses.push("(u.name LIKE ? OR u.email LIKE ?)");
            params.push(`%${userSearch}%`, `%${userSearch}%`);
        }
        if (action) {
            whereClauses.push("l.action LIKE ?");
            params.push(`%${action}%`);
        }

        const whereString = whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";

        // Conteo total para páginas
        const countSql = `SELECT COUNT(*) as total FROM activity_logs l INNER JOIN users u ON l.user_id = u.id ${whereString}`;
        const [[{ total }]] = await pool.query(countSql, params);

        const sql = `
            SELECT l.id, l.action, l.entity, l.entity_id, l.space_id, l.details, l.ip_address, l.created_at,
                   u.name as user_name, u.email as user_email
            FROM activity_logs l
            JOIN users u ON l.user_id = u.id
            ${whereString}
            ORDER BY l.created_at DESC
            LIMIT ? OFFSET ?
        `;

        const queryParams = [...params, limit, offset];
        const [logs] = await pool.query(sql, queryParams);

        res.json({
            logs,
            total,
            page,
            totalPages: Math.ceil(total / limit)
        });
    } catch (error) {
        res.status(500).json({ message: 'Error devolviendo registros de auditoría.', error: error.message });
    }
};

const getLogActions = async (req, res) => {
    try {
        const [actions] = await pool.query('SELECT DISTINCT action FROM activity_logs ORDER BY action ASC');
        res.json(actions.map(a => a.action));
    } catch (error) {
        res.status(500).json({ message: 'Error obteniendo acciones de auditoría.', error: error.message });
    }
};

module.exports = {
    getLogs,
    getLogActions
};
