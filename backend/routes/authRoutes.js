const express = require('express');
const router = express.Router();
const { getCaptcha, register, login } = require('../controllers/authController');

router.get('/captcha', getCaptcha);
router.post('/register', register);
router.post('/login', login);

module.exports = router;
