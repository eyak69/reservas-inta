const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const svgCaptcha = require('svg-captcha');

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
    const { name, email, password, captchaText, captchaToken } = req.body;

    if (!name || !email || !password || !captchaText || !captchaToken) {
        return res.status(400).json({ message: 'Todos los campos son obligatorios.' });
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
            { expiresIn: '24h' }
        );

        res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar_url: user.avatar_url } });
    } catch (error) {
        res.status(500).json({ message: 'Error en el inicio de sesión', error: error.message });
    }
};

module.exports = { getCaptcha, register, login };
