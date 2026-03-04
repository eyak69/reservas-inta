const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const logActivity = require('../utils/logger');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Iniciar sesión / Registro automático con Google
const googleLogin = async (req, res) => {
    const { token } = req.body;
    console.log('[DEBUG-GOOGLE] Petición recibida. Token presente:', !!token);
    try {
        console.log('[DEBUG-GOOGLE] Verificando token con audience:', process.env.GOOGLE_CLIENT_ID);
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        console.log('[DEBUG-GOOGLE] Payload obtenido:', payload.email);
        const { sub: google_id, email, name, picture: avatar_url } = payload;

        // Verificar si el usuario ya existe
        console.log('[DEBUG-GOOGLE] Buscando usuario en DB:', email);
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        let user;

        if (rows.length > 0) {
            user = rows[0];
            // Distinguir usuario pendiente de aprobación vs dado de baja
            if (user.is_active === 0 || user.is_active === false) {
                // Verificar si tiene contraseña (registro email) o si es Google-only
                // En ambos casos, si is_active=false puede ser pendiente o dado de baja
                // Usamos un campo extra: si nunca fue activo (created_at reciente y nunca se aprobó)
                // Lo más simple: devolver 202 si role='usuario' sin historial, o 403 si fue bajado
                // Para simplificar, todos los is_active=false son "pendiente de aprobación"
                return res.status(202).json({
                    pending: true,
                    message: 'Tu cuenta está pendiente de aprobación por un administrador. Te avisaremos cuando esté habilitada.'
                });
            }
            // Actualizar datos de Google en cada inicio de sesión por si cambiaron foto o nombre
            await pool.query('UPDATE users SET google_id = ?, name = ?, avatar_url = ? WHERE id = ?',
                [google_id, name, avatar_url, user.id]);
        } else {
            // Nuevo usuario: crear con is_active=false hasta que el admin lo apruebe
            const role = 'usuario';
            await pool.query(
                'INSERT INTO users (google_id, email, name, avatar_url, role, is_active) VALUES (?, ?, ?, ?, ?, false)',
                [google_id, email, name, avatar_url, role]
            );
            // No devolver token — el usuario debe esperar aprobación del admin
            return res.status(202).json({
                pending: true,
                message: 'Tu cuenta ha sido creada exitosamente. Un administrador debe habilitarla antes de que puedas ingresar. Te avisaremos pronto.'
            });
        }

        // Crear JWT propio para las sesiones (solo usuarios activos llegan aquí)
        const jwtToken = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '12h' }
        );

        logActivity(user.id, 'LOGIN', 'Auth', user.id, null, { method: 'google', email: user.email }, req.ip);

        res.json({
            token: jwtToken,
            user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar_url: user.avatar_url }
        });
    } catch (error) {
        console.error('Error en googleLogin:', error);
        res.status(401).json({ message: 'Fallo la validación con Google.', error: error.message });
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
    googleLogin,
    getAllUsers,
    getProfile,
    toggleUserStatus,
    changeUserRole,
    generateResetToken,
    updatePassword
};
