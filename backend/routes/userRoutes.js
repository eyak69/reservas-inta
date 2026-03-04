const express = require('express');
const router = express.Router();
const { googleLogin, getAllUsers, getProfile, toggleUserStatus, changeUserRole, generateResetToken, updatePassword } = require('../controllers/userController');
const { authMiddleware, adminMiddleware } = require('../middlewares/authMiddleware');

router.post('/login/google', googleLogin);
router.get('/profile', authMiddleware, getProfile);
router.put('/profile/password', authMiddleware, updatePassword);
router.get('/', authMiddleware, adminMiddleware, getAllUsers);
router.put('/:id/toggle-status', authMiddleware, adminMiddleware, toggleUserStatus);
router.put('/:id/change-role', authMiddleware, adminMiddleware, changeUserRole);
router.post('/:id/generate-reset-token', authMiddleware, adminMiddleware, generateResetToken);

module.exports = router;
