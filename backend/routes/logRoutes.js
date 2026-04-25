const express = require('express');
const router = express.Router();
const { getLogs, getLogActions } = require('../controllers/logController');
const { authMiddleware, adminMiddleware } = require('../middlewares/authMiddleware');
const { discoverModels } = require('../services/modelDiscovery');
const { refreshModels }  = require('../controllers/chatController');

// Solo administradores pueden ver auditorías
router.get('/', authMiddleware, adminMiddleware, getLogs);
router.get('/actions', authMiddleware, adminMiddleware, getLogActions);

// Redescubre y recarga modelos de IA sin reiniciar el servidor
router.post('/refresh-models', authMiddleware, adminMiddleware, async (req, res) => {
    res.json({ ok: true });
    try {
        await discoverModels();
        await refreshModels();
    } catch (e) {
        console.error('[RefreshModels] Error:', e.message);
    }
});

module.exports = router;
