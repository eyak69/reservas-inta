const express = require('express');
const router = express.Router();
const { getNotifications, markAllAsRead } = require('../controllers/notificationController');
const { authMiddleware } = require('../middlewares/authMiddleware');

router.get('/', authMiddleware, getNotifications);
router.post('/read-all', authMiddleware, markAllAsRead);

module.exports = router;
