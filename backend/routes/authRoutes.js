const express = require('express');
const router = express.Router();
const { getCaptcha, register, verifyOTP, login, resetPassword, validateResetToken } = require('../controllers/authController');

router.get('/captcha', getCaptcha);
router.get('/validate-reset/:token', validateResetToken);
router.post('/register', register);
router.post('/verify-otp', verifyOTP);
router.post('/login', login);
router.post('/reset-password', resetPassword);

module.exports = router;
