const express = require('express');
const router = express.Router();
const {
    getAllReservations, getAllPublicReservations, getMyReservations, getReservationsBySpace,
    createReservation, updateReservationStatus, cancelReservation
} = require('../controllers/reservationController');
const { authMiddleware, adminMiddleware } = require('../middlewares/authMiddleware');

// Validar todas las rutas con login al menos
router.use(authMiddleware);

// Rutas Generales Usuario
router.get('/my-reservations', getMyReservations);
router.get('/calendar', getAllPublicReservations);
router.get('/space/:spaceId', getReservationsBySpace);
router.post('/', createReservation);
router.delete('/:id', cancelReservation);

// Rutas Administrativas
router.get('/', adminMiddleware, getAllReservations);
router.put('/:id/status', adminMiddleware, updateReservationStatus);

module.exports = router;
