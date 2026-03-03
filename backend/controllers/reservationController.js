const pool = require('../config/db');

// Obtener todas las reservas (Admin)
const getAllReservations = async (req, res) => {
    try {
        const sql = `
            SELECT r.*, u.name as user_name, u.email as user_email, s.name as space_name 
            FROM reservations r
            JOIN users u ON r.user_id = u.id
            JOIN spaces s ON r.space_id = s.id
            ORDER BY r.start_time DESC
        `;
        const [reservations] = await pool.query(sql);
        res.json(reservations);
    } catch (error) {
        res.status(500).json({ message: 'Error obteniendo reservas', error: error.message });
    }
};

// Obtener todas las reservas (Público/Usuarios - Solo para calendario, sin info de email)
const getAllPublicReservations = async (req, res) => {
    try {
        const sql = `
            SELECT r.id, r.space_id, r.start_time, r.end_time, r.status, r.comments as description, s.name as space_name, u.name as user_name
            FROM reservations r
            JOIN spaces s ON r.space_id = s.id
            JOIN users u ON r.user_id = u.id
            WHERE r.status IN('aprobada', 'pendiente')
            `;
        const [reservations] = await pool.query(sql);
        res.json(reservations);
    } catch (error) {
        res.status(500).json({ message: 'Error obteniendo calendario', error: error.message });
    }
};

// Obtener las reservas del usuario logueado (Usuario)
const getMyReservations = async (req, res) => {
    try {
        const sql = `
            SELECT r.*, s.name as space_name 
            FROM reservations r
            JOIN spaces s ON r.space_id = s.id
            WHERE r.user_id = ?
            ORDER BY r.start_time DESC
                `;
        const [reservations] = await pool.query(sql, [req.user.id]);
        res.json(reservations);
    } catch (error) {
        res.status(500).json({ message: 'Error obteniendo mis reservas', error: error.message });
    }
};

// Obtener reservas por espacio (Público/Usuario para ver disponibilidad de fechas)
const getReservationsBySpace = async (req, res) => {
    try {
        // Solo enviamos datos básicos y las aprobadas o pendientes para calendario
        const sql = `
            SELECT id, space_id, start_time, end_time, status 
            FROM reservations 
            WHERE space_id = ? AND status IN('aprobada', 'pendiente')
            ORDER BY start_time ASC
            `;
        const [reservations] = await pool.query(sql, [req.params.spaceId]);
        res.json(reservations);
    } catch (error) {
        res.status(500).json({ message: 'Error revisando disponibilidad', error: error.message });
    }
};

// Crear nueva reserva (Usuario)
const createReservation = async (req, res) => {
    const { space_id, start_time, end_time, comments } = req.body;
    const user_id = req.user.id;

    if (new Date(start_time) >= new Date(end_time)) {
        return res.status(400).json({ message: 'La hora de fin debe ser posterior a la de inicio.' });
    }

    try {
        // Simple validación de superposición
        const checkSql = `
            SELECT id FROM reservations 
            WHERE space_id = ? AND status IN('aprobada', 'pendiente')
        AND(
            (start_time <= ? AND end_time > ?) OR
                (start_time < ? AND end_time >= ?) OR
                    (start_time >= ? AND end_time <= ?)
            )
`;
        const [conflicts] = await pool.query(checkSql, [
            space_id, start_time, start_time, end_time, end_time, start_time, end_time
        ]);

        if (conflicts.length > 0) {
            return res.status(409).json({ message: 'El espacio ya está reservado o con reserva pendiente en ese horario.' });
        }

        const [result] = await pool.query(
            'INSERT INTO reservations (user_id, space_id, start_time, end_time, status, comments) VALUES (?, ?, ?, ?, ?, ?)',
            [user_id, space_id, start_time, end_time, 'pendiente', comments] // empiezar pendientes por defecto
        );
        res.status(201).json({ message: 'Reserva creada exitosamente', id: result.insertId });
    } catch (error) {
        res.status(500).json({ message: 'Error creando reserva', error: error.message });
    }
};

// Actualizar estado de la reserva (Admin)
const updateReservationStatus = async (req, res) => {
    const { status } = req.body;
    try {
        await pool.query('UPDATE reservations SET status = ? WHERE id = ?', [status, req.params.id]);
        res.json({ message: `Reserva actualizada a estado: ${status} ` });
    } catch (error) {
        res.status(500).json({ message: 'Error actualizando estado', error: error.message });
    }
};

// Cancelar/Borrar reserva
const cancelReservation = async (req, res) => {
    try {
        // Solo el dueño original de la reserva o un admin deberían borrar/cancelar
        const [rows] = await pool.query('SELECT user_id FROM reservations WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ message: 'No encontrada' });

        if (rows[0].user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Acceso denegado.' });
        }

        await pool.query('UPDATE reservations SET status = "cancelada" WHERE id = ?', [req.params.id]);
        res.json({ message: 'Reserva cancelada' });
    } catch (error) {
        res.status(500).json({ message: 'Error cancelando reserva', error: error.message });
    }
};

module.exports = {
    getAllReservations,
    getAllPublicReservations,
    getMyReservations,
    getReservationsBySpace,
    createReservation,
    updateReservationStatus,
    cancelReservation
};
