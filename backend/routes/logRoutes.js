const express = require('express');
const router = express.Router();
const { getLogs, getLogActions } = require('../controllers/logController');
const { authMiddleware, adminMiddleware } = require('../middlewares/authMiddleware');

// Solo administradores pueden ver auditorías
router.get('/', authMiddleware, adminMiddleware, getLogs);
router.get('/actions', authMiddleware, adminMiddleware, getLogActions);

module.exports = router;
