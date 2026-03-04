const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const svgCaptcha = require('svg-captcha');
const logActivity = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_123';

// 1. Obtener un nuevo CAPTCHA
const getCaptcha = (req, res) => {
    // Generamos un string y una imagen SVG
    const captcha = svgCaptcha.create({
        size: 5,
        ignoreChars: '0o1i',
        noise: 2,
        color: true,
        background: '#1e293b' // bg-slate-800
    });

    // Para validar luego sin usar sesiones (ya que es REST), firmamos el texto del captcha en un token corto
    const captchaToken = jwt.sign({ text: captcha.text.toLowerCase() }, JWT_SECRET, { expiresIn: '5m' });

    res.json({
        svg: captcha.data,
        captchaToken: captchaToken
    });
};

// 2. Registro local (con contraseña y Captcha)
const register = async (req, res) => {
    const { name, email, password, confirmPassword, captchaText, captchaToken } = req.body;

    if (!name || !email || !password || !confirmPassword || !captchaText || !captchaToken) {
        return res.status(400).json({ message: 'Todos los campos son obligatorios.' });
    }

    if (password !== confirmPassword) {
        return res.status(400).json({ message: 'Las contraseñas no coinciden.' });
    }

    if (password.length < 6) {
        return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres por seguridad.' });
    }

    // Validar CAPTCHA
    try {
        const decoded = jwt.verify(captchaToken, JWT_SECRET);
        if (decoded.text !== captchaText.toLowerCase()) {
            return res.status(400).json({ message: 'El código de seguridad es incorrecto.' });
        }
    } catch (err) {
        return res.status(400).json({ message: 'El código de seguridad expiró o es inválido. Solicita uno nuevo.' });
    }

    try {
        // Chequear si el mail existe
        const [existing] = await pool.query('SELECT id, is_active FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(400).json({ message: 'El correo electrónico ya está registrado.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const [result] = await pool.query(
            'INSERT INTO users (name, email, password, role, is_active) VALUES (?, ?, ?, "usuario", false)',
            [name, email, hashedPassword]
        );

        logActivity(result.insertId, 'REGISTER', 'Auth', result.insertId, null, { email, role: 'usuario' }, req.ip);

        res.status(201).json({
            message: 'Registro exitoso. Tu cuenta debe ser autorizada por un Administrador.'
        });
    } catch (error) {
        res.status(500).json({ message: 'Error registrando el usuario', error: error.message });
    }
};

// 3. Inicio de sesión local
const login = async (req, res) => {
    const { email, password } = req.body;

    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        const user = rows[0];

        if (!user) {
            return res.status(401).json({ message: 'Credenciales inválidas.' });
        }

        if (user.is_active === 0 || user.is_active === false) {
            return res.status(202).json({
                pending: true,
                message: 'Tu cuenta está pendiente de aprobación por un administrador. Te avisaremos cuando esté habilitada.'
            });
        }

        if (!user.password) {
            return res.status(400).json({ message: 'Esta cuenta solo usa Google Sign-In. Entra usando Google.' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ message: 'Credenciales inválidas.' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, name: user.name, role: user.role, avatar_url: user.avatar_url },
            JWT_SECRET,
            { expiresIn: '12h' }
        );

        logActivity(user.id, 'LOGIN', 'Auth', user.id, null, { method: 'local', email: user.email }, req.ip);

        res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar_url: user.avatar_url } });
    } catch (error) {
        res.status(500).json({ message: 'Error en el inicio de sesión', error: error.message });
    }
};

// 4. Resetear contraseña con token
const resetPassword = async (req, res) => {
    const { token, password } = req.body;
    console.log(`[DEBUG] Intento de reset con token: ${token?.substring(0, 10)}...`);

    if (!token || !password) {
        return res.status(400).json({ message: 'Token y contraseña son obligatorios.' });
    }

    if (password.length < 6) {
        return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres.' });
    }

    try {
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
        console.log(`[DEBUG] Hashed Token para búsqueda: ${hashedToken}`);

        const [users] = await pool.query(
            'SELECT id, email, name FROM users WHERE reset_token = ? AND reset_token_expiry > NOW()',
            [hashedToken]
        );

        if (users.length === 0) {
            console.log(`[DEBUG] No se encontró usuario para el token o expiró.`);
            return res.status(400).json({ message: 'El link de recuperación es inválido o ha expirado.' });
        }

        const user = users[0];
        console.log(`[DEBUG] Usuario encontrado: ${user.email} (ID: ${user.id})`);

        const hashedPassword = await bcrypt.hash(password, 10);

        const [result] = await pool.query(
            'UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?',
            [hashedPassword, user.id]
        );

        if (result.affectedRows === 0) {
            console.error(`[ERROR] No se pudo actualizar la contraseña en DB para ID: ${user.id}`);
            return res.status(500).json({ message: 'Error interno al actualizar la base de datos.' });
        }

        logActivity(user.id, 'RESET_PASSWORD', 'Auth', user.id, null, { email: user.email }, req.ip);
        console.log(`[DEBUG] Contraseña actualizada exitosamente para ${user.email}`);

        res.json({ message: `¡Contraseña de ${user.name} actualizada con éxito! Ya puedes iniciar sesión.` });
    } catch (error) {
        console.error('[ERROR] Excepción en resetPassword:', error);
        res.status(500).json({ message: 'Error procesando el reset de contraseña', error: error.message });
    }
};

// 5. Validar token de reset (para mostrar info del usuario en el frontend)
const validateResetToken = async (req, res) => {
    const { token } = req.params;
    try {
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
        const [users] = await pool.query(
            'SELECT name, email FROM users WHERE reset_token = ? AND reset_token_expiry > NOW()',
            [hashedToken]
        );

        if (users.length === 0) {
            return res.status(400).json({ message: 'Link inválido o expirado.' });
        }

        res.json({ user: users[0] });
    } catch (error) {
        res.status(500).json({ message: 'Error validando token', error: error.message });
    }
};

module.exports = { getCaptcha, register, login, resetPassword, validateResetToken };
