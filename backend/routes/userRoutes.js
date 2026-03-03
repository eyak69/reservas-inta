const express = require('express');
const router = express.Router();
const { googleLogin, getAllUsers, getProfile, toggleUserStatus, changeUserRole } = require('../controllers/userController');
const { authMiddleware, adminMiddleware } = require('../middlewares/authMiddleware');

router.post('/login/google', googleLogin);
router.get('/profile', authMiddleware, getProfile);
router.get('/', authMiddleware, adminMiddleware, getAllUsers);
router.put('/:id/toggle-status', authMiddleware, adminMiddleware, toggleUserStatus);
router.put('/:id/change-role', authMiddleware, adminMiddleware, changeUserRole);

module.exports = router;
