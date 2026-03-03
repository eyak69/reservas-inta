const express = require('express');
const router = express.Router();
const {
    getAllSpaces, getSpaceById, createSpace, updateSpace, deleteSpace
} = require('../controllers/spaceController');
const { authMiddleware, adminMiddleware } = require('../middlewares/authMiddleware');

// Públicas o básicas (el middleware luego lo podemos ajustar según necesidad logueada)
router.get('/', getAllSpaces);
router.get('/:id', getSpaceById);

// Administrativas
router.post('/', authMiddleware, adminMiddleware, createSpace);
router.put('/:id', authMiddleware, adminMiddleware, updateSpace);
router.delete('/:id', authMiddleware, adminMiddleware, deleteSpace);

module.exports = router;
