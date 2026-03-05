const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const logActivity = require('../utils/logger');

const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/users/login/google/callback'
);

// Iniciar sesión / Registro automático con Google (Redirección OAuth2)
const googleLoginStart = (req, res) => {
    try {
        const authorizeUrl = client.generateAuthUrl({
            access_type: 'offline',
            scope: ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email'],
            prompt: 'consent'
        });
        res.redirect(authorizeUrl);
    } catch (error) {
        console.error('[ERROR] googleLoginStart:', error);
        res.redirect('/#error=' + encodeURIComponent('Error interno iniciando flujo de Google.'));
    }
};

const googleLoginCallback = async (req, res) => {
    const { code } = req.query;
    if (!code) {
        return res.redirect('/#error=' + encodeURIComponent('No se recibió código de autorización de Google.'));
    }

    try {
        const { tokens } = await client.getToken(code);

        // Verificamos el ID Token para obtener el perfil del usuario
        const ticket = await client.verifyIdToken({
            idToken: tokens.id_token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const { sub: google_id, email, name, picture: avatar_url } = payload;

        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        let user;

        if (rows.length > 0) {
            user = rows[0];
            if (user.is_active === 0 || user.is_active === false) {
                return res.redirect('/#pending=1&message=' + encodeURIComponent('Tu cuenta está pendiente de aprobación por un administrador. Te avisaremos cuando esté habilitada.'));
            }
            await pool.query('UPDATE users SET google_id = ?, name = ?, avatar_url = ? WHERE id = ?',
                [google_id, name, avatar_url, user.id]);
        } else {
            const role = 'usuario';
            await pool.query(
                'INSERT INTO users (google_id, email, name, avatar_url, role, is_active) VALUES (?, ?, ?, ?, ?, false)',
                [google_id, email, name, avatar_url, role]
            );
            return res.redirect('/#pending=1&message=' + encodeURIComponent('Tu cuenta ha sido creada exitosamente. Un administrador debe habilitarla antes de que puedas ingresar.'));
        }

        const jwtToken = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '12h' }
        );

        logActivity(user.id, 'LOGIN', 'Auth', user.id, null, { method: 'google', email: user.email }, req.ip);

        // Devolver el token por URL hash
        res.redirect(`/#token=${jwtToken}`);
    } catch (error) {
        console.error('[ERROR] googleLoginCallback:', error);
        res.redirect('/#error=' + encodeURIComponent('Fallo la validación con Google: ' + error.message));
    }
};

// Obtener todos los usuarios (Solo Admin) con paginación y búsqueda
const getAllUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';

        let whereClause = '';
        let params = [];

        if (search) {
            whereClause = 'WHERE name LIKE ? OR email LIKE ?';
            params.push(`%${search}%`, `%${search}%`);
        }

        // Conteo total para paginación
        const countSql = `SELECT COUNT(*) as total FROM users ${whereClause}`;
        const [[{ total }]] = await pool.query(countSql, params);

        // Consulta paginada
        const sql = `
            SELECT id, name, email, avatar_url, role, is_active, created_at 
            FROM users 
            ${whereClause}
            ORDER BY id DESC 
            LIMIT ? OFFSET ?
        `;
        const [users] = await pool.query(sql, [...params, limit, offset]);

        res.json({
            users,
            total,
            totalPages: Math.ceil(total / limit),
            page
        });
    } catch (error) {
        res.status(500).json({ message: 'Error obteniendo usuarios.', error: error.message });
    }
};

// Obtener el perfil del usuario logueado
const getProfile = async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, name, email, avatar_url, role, created_at, password FROM users WHERE id = ?', [req.user.id]);
        if (rows.length === 0) return res.status(404).json({ message: 'Usuario no encontrado' });

        const user = rows[0];
        const hasPassword = !!user.password;
        delete user.password; // Quitar el hash antes de enviar

        res.json({ ...user, hasPassword });
    } catch (error) {
        res.status(500).json({ message: 'Error en perfil.', error: error.message });
    }
};

// Actualizar contraseña del propio usuario
const updatePassword = async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 6 caracteres.' });
    }

    try {
        const [rows] = await pool.query('SELECT password FROM users WHERE id = ?', [userId]);
        const user = rows[0];

        // Si ya tiene contraseña, validar la anterior
        if (user.password) {
            if (!oldPassword) {
                return res.status(400).json({ message: 'Debes ingresar tu contraseña actual para cambiarla.' });
            }
            const isMatch = await bcrypt.compare(oldPassword, user.password);
            if (!isMatch) {
                return res.status(401).json({ message: 'La contraseña actual es incorrecta.' });
            }
        }

        // Hashear nueva contraseña
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId]);

        logActivity(userId, 'UPDATE_PASSWORD', 'Usuario', userId, null, { method: user.password ? 'change' : 'set' }, req.ip);

        res.json({ message: 'Contraseña actualizada con éxito.' });
    } catch (error) {
        res.status(500).json({ message: 'Error actualizando contraseña.', error: error.message });
    }
};

// Cambiar estado activo/inactivo de un usuario (Solo Admin)
const toggleUserStatus = async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await pool.query('SELECT is_active, role FROM users WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ message: 'Usuario no encontrado' });

        if (rows[0].role === 'admin') {
            return res.status(403).json({ message: 'No puedes dar de baja a otros administradores directamente.' });
        }

        const newStatus = !rows[0].is_active;
        await pool.query('UPDATE users SET is_active = ? WHERE id = ?', [newStatus, id]);

        logActivity(req.user.id, newStatus ? 'ACTIVATE_USER' : 'SUSPEND_USER', 'Usuario', id, null, { admin_id: req.user.id, target_user_action: newStatus }, req.ip);

        res.json({ message: newStatus ? 'Usuario reactivado' : 'Usuario dado de baja', is_active: newStatus });
    } catch (error) {
        res.status(500).json({ message: 'Error cambiando el estado del usuario', error: error.message });
    }
};

// Cambiar rol de un usuario entre "usuario" y "admin" (Solo Admin)
const changeUserRole = async (req, res) => {
    const { id } = req.params;
    const adminId = req.user.id;

    if (parseInt(id) === adminId) {
        return res.status(403).json({ message: 'No puedes cambiar tu propio rol.' });
    }

    try {
        const [rows] = await pool.query('SELECT role FROM users WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ message: 'Usuario no encontrado' });

        const newRole = rows[0].role === 'admin' ? 'usuario' : 'admin';
        await pool.query('UPDATE users SET role = ? WHERE id = ?', [newRole, id]);

        logActivity(req.user.id, 'CHANGE_ROLE', 'Usuario', id, null, { admin_id: req.user.id, target_user_role: newRole }, req.ip);

        res.json({ message: `Rol cambiado a "${newRole}" exitosamente.`, role: newRole });
    } catch (error) {
        res.status(500).json({ message: 'Error cambiando el rol del usuario', error: error.message });
    }
};

// Generar Link de Recuperación de Contraseña (Solo Admin)
const generateResetToken = async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await pool.query('SELECT email FROM users WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ message: 'Usuario no encontrado' });

        // Generar token aleatorio de alta entropía
        const rawToken = crypto.randomBytes(32).toString('hex');

        // Hashear el token con SHA256 para búsqueda directa y segura (Seguridad Crítica)
        const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

        // Expiración en 24 horas
        const expiry = new Date();
        expiry.setHours(expiry.getHours() + 24);

        await pool.query(
            'UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?',
            [hashedToken, expiry, id]
        );

        logActivity(req.user.id, 'GENERATE_RESET_TOKEN', 'Usuario', id, null, { admin_id: req.user.id }, req.ip);

        res.json({
            message: 'Token generado exitosamente.',
            token: rawToken,
            expiresAt: expiry
        });
    } catch (error) {
        res.status(500).json({ message: 'Error generando el token de reset', error: error.message });
    }
};

module.exports = {
    googleLoginStart,
    googleLoginCallback,
    getAllUsers,
    getProfile,
    toggleUserStatus,
    changeUserRole,
    generateResetToken,
    updatePassword
};
