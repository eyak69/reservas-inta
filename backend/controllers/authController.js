const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const svgCaptcha = require('svg-captcha');
const logActivity = require('../utils/logger');
const { sendNotificationEvent } = require('../services/notificationService');
const { validateEmailRealness } = require('../utils/emailValidator');
const { sendVerificationEmail } = require('../services/mailService');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_123';
const ALLOWED_DOMAINS = (process.env.ALLOWED_DOMAINS || 'inta.gob.ar').split(',').map(d => d.trim().toLowerCase());

/**
 * 1. Obtener un nuevo CAPTCHA
 */
const getCaptcha = (req, res) => {
    const captcha = svgCaptcha.create({
        size: 5,
        ignoreChars: '0o1i',
        noise: 2,
        color: true,
        background: '#1e293b'
    });

    const captchaToken = jwt.sign({ text: captcha.text.toLowerCase() }, JWT_SECRET, { expiresIn: '5m' });

    res.json({
        svg: captcha.data,
        captchaToken: captchaToken
    });
};

/**
 * 2. Registro local (con contraseña y Captcha)
 */
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

    // Validar que el email sea real (No verdura) - Regla 10
    const isRealEmail = await validateEmailRealness(email);
    if (!isRealEmail) {
        return res.status(400).json({ message: 'El correo electrónico parece ser inválido o el dominio no existe. Ingresa un mail real.' });
    }

    // Restricción Institucional (Regla 10)
    const domain = email.split('@')[1].toLowerCase();
    if (!ALLOWED_DOMAINS.includes(domain)) {
        return res.status(400).json({ 
            message: `Solo se permiten correos institucionales de los dominios: ${ALLOWED_DOMAINS.join(', ')}` 
        });
    }

    try {
        // Chequear si el mail existe
        const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(400).json({ message: 'El correo electrónico ya está registrado.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Determinar si saltamos la verificación por correo (Regla 10)
        const skipVerify = process.env.SKIP_EMAIL_VERIFICATION === 'true';
        // Generamos un código siempre para mantener consistencia en la DB y logs (Regla 3)
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

        const [result] = await pool.query(
            'INSERT INTO users (name, email, password, role, is_active, is_verified, verification_code) VALUES (?, ?, ?, "usuario", false, ?, ?)',
            [name, email, hashedPassword, skipVerify, verificationCode]
        );

        logActivity(result.insertId, 'REGISTER', 'Auth', result.insertId, null, { email, role: 'usuario', skipVerify }, req.ip);

        // Delegamos al servicio: Él sabe si enviar SMTP o loguear según el bypass (Regla 12)
        sendVerificationEmail(email, name, verificationCode);

        // Alerta multicanal para Admins
        const notifTitle = skipVerify ? 'Nuevo Registro (Bypass)' : 'Nuevo Registro (Pendiente Verificación)';
        const notifMsg = skipVerify 
            ? `👤 Nombre: ${name}\n📧 Email: ${email}\n\nEl usuario ya está registrado y se encuentra pendiente de aprobación. Debes habilitar su cuenta desde el panel de administración.`
            : `👤 Nombre: ${name}\n📧 Email: ${email}\n\nEl usuario debe verificar su mail antes de que puedas habilitarlo.`;

        await sendNotificationEvent({
            title: notifTitle,
            message: notifMsg,
            toAdmins: true,
            type: 'info'
        });

        res.status(201).json({
            message: skipVerify 
                ? 'Tu cuenta está pendiente de aprobación por un administrador. Una vez habilitada podrás ingresar al sistema.' 
                : 'Registro exitoso. Se ha enviado un código de verificación a tu correo.',
            email: email,
            skipOTP: skipVerify
        });
    } catch (error) {
        res.status(500).json({ message: 'Error registrando el usuario', error: error.message });
    }
};

/**
 * 3. Inicio de sesión local
 */
const login = async (req, res) => {
    const { email, password } = req.body;

    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        const user = rows[0];

        if (!user) {
            return res.status(401).json({ message: 'Credenciales inválidas.' });
        }

        // Primero revisamos si está activo (Regla de negocio: Admins habilitan)
        if (user.is_active === 0 || user.is_active === false) {
            return res.status(202).json({
                pending: true,
                message: 'Tu cuenta está pendiente de aprobación por un administrador. Una vez habilitada podrás ingresar al sistema.'
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

/**
 * 4. Resetear contraseña con token
 */
const resetPassword = async (req, res) => {
    const { token, password } = req.body;

    if (!token || !password) {
        return res.status(400).json({ message: 'Token y contraseña son obligatorios.' });
    }

    if (password.length < 6) {
        return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres.' });
    }

    try {
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
        const [users] = await pool.query(
            'SELECT id, email, name FROM users WHERE reset_token = ? AND reset_token_expiry > NOW()',
            [hashedToken]
        );

        if (users.length === 0) {
            return res.status(400).json({ message: 'El link de recuperación es inválido o ha expirado.' });
        }

        const user = users[0];
        const hashedPassword = await bcrypt.hash(password, 10);

        await pool.query(
            'UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?',
            [hashedPassword, user.id]
        );

        logActivity(user.id, 'RESET_PASSWORD', 'Auth', user.id, null, { email: user.email }, req.ip);

        res.json({ message: `¡Contraseña de ${user.name} actualizada con éxito! Ya puedes iniciar sesión.` });
    } catch (error) {
        res.status(500).json({ message: 'Error procesando el reset de contraseña', error: error.message });
    }
};

/**
 * 5. Validar token de reset
 */
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

/**
 * 6. Verificar PIN de correo (Mantenemos por compatibilidad, aunque no se use ahora)
 */
const verifyOTP = async (req, res) => {
    const { email, code } = req.body;

    if (!email || !code) {
        return res.status(400).json({ message: 'Email y código requeridos.' });
    }

    try {
        const [users] = await pool.query(
            'SELECT id, name, verification_code FROM users WHERE email = ? AND is_verified = false',
            [email]
        );

        if (users.length === 0) {
            return res.status(400).json({ message: 'Usuario no encontrado o ya verificado.' });
        }

        const user = users[0];

        if (user.verification_code !== code) {
            return res.status(400).json({ message: 'El código de verificación es incorrecto.' });
        }

        await pool.query(
            'UPDATE users SET is_verified = true, verification_code = NULL WHERE id = ?',
            [user.id]
        );

        logActivity(user.id, 'VERIFY_EMAIL', 'Auth', user.id, null, { email }, req.ip);

        res.json({ message: '¡Email verificado con éxito! Ahora un administrador debe habilitar tu cuenta.' });
    } catch (error) {
        res.status(500).json({ message: 'Error verificando el código', error: error.message });
    }
};

module.exports = { getCaptcha, register, verifyOTP, login, resetPassword, validateResetToken };
