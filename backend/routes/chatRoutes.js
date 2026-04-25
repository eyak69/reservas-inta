const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/authMiddleware');
const { sendMessage, clearSession } = require('../controllers/chatController');

// POST /api/chat/message — requiere JWT válido
router.post('/message', authMiddleware, sendMessage);

// POST /api/chat/clear — limpia la memoria de sesión del usuario (llamado en logout)
router.post('/clear', authMiddleware, (req, res) => {
    clearSession(req.user.id);
    res.json({ message: 'Memoria de chat limpiada.' });
});

module.exports = router;
