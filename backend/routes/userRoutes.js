const express = require('express');
const router = express.Router();
const { googleLoginStart, googleLoginCallback, getAllUsers, getProfile, toggleUserStatus, changeUserRole, generateResetToken, updatePassword } = require('../controllers/userController');
const { authMiddleware, adminMiddleware } = require('../middlewares/authMiddleware');

router.get('/login/google', googleLoginStart);
router.get('/login/google/callback', googleLoginCallback);
router.get('/profile', authMiddleware, getProfile);
router.put('/profile/password', authMiddleware, updatePassword);
router.get('/', authMiddleware, adminMiddleware, getAllUsers);
router.put('/:id/toggle-status', authMiddleware, adminMiddleware, toggleUserStatus);
router.put('/:id/change-role', authMiddleware, adminMiddleware, changeUserRole);
router.post('/:id/generate-reset-token', authMiddleware, adminMiddleware, generateResetToken);

module.exports = router;
