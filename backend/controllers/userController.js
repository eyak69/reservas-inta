const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Iniciar sesión / Registro automático con Google
const googleLogin = async (req, res) => {
    const { token } = req.body;
    try {
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID,
            // En desarrollo a veces es útil relajar chequeos, pero client_id es obligatorio
        });
        const payload = ticket.getPayload();
        const { sub: google_id, email, name, picture: avatar_url } = payload;

        // Verificar si el usuario ya existe
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
            { expiresIn: '24h' }
        );

        res.json({
            token: jwtToken,
            user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar_url: user.avatar_url }
        });
    } catch (error) {
        console.error('Error en googleLogin:', error);
        res.status(401).json({ message: 'Fallo la validación con Google.', error: error.message });
    }
};

// Obtener todos los usuarios (Solo Admin)
const getAllUsers = async (req, res) => {
    try {
        const [users] = await pool.query('SELECT id, name, email, avatar_url, role, is_active, created_at FROM users ORDER BY id DESC');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Error obteniendo usuarios.', error: error.message });
    }
};

// Obtener el perfil del usuario logueado
const getProfile = async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, name, email, avatar_url, role, created_at FROM users WHERE id = ?', [req.user.id]);
        if (rows.length === 0) return res.status(404).json({ message: 'Usuario no encontrado' });
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ message: 'Error en perfil.', error: error.message });
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

        res.json({ message: `Rol cambiado a "${newRole}" exitosamente.`, role: newRole });
    } catch (error) {
        res.status(500).json({ message: 'Error cambiando el rol del usuario', error: error.message });
    }
};

module.exports = {
    googleLogin,
    getAllUsers,
    getProfile,
    toggleUserStatus,
    changeUserRole
};
