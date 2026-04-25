const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Acceso no autorizado. Token faltante.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Validar que el usuario siga existiendo y activo en la BD
        const [rows] = await pool.query('SELECT is_active, name, email, role FROM users WHERE id = ?', [decoded.id]);
        if (rows.length === 0) {
            return res.status(401).json({ message: 'El usuario ya no existe en el sistema.' });
        }
        if (rows[0].is_active === 0 || rows[0].is_active === false) {
            return res.status(403).json({ message: 'Tu cuenta ha sido deshabilitada por el administrador.' });
        }

        // Siempre usar datos frescos de la BD (nombre, rol) — el JWT puede ser stale
        req.user = { ...decoded, name: rows[0].name, email: rows[0].email, role: rows[0].role };
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Token inválido o expirado.' });
    }
};

const adminMiddleware = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        return res.status(403).json({ message: 'Acceso denegado. Rol de administrador requerido.' });
    }
};

module.exports = { authMiddleware, adminMiddleware };
