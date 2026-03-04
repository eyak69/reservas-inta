const pool = require('../config/db');
const logActivity = require('../utils/logger');

// Obtener todos los espacios (Público)
const getAllSpaces = async (req, res) => {
    try {
        const [spaces] = await pool.query('SELECT * FROM spaces WHERE is_active = TRUE');
        res.json(spaces);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener espacios', error: error.message });
    }
};

// Obtener un espacio por ID (Público)
const getSpaceById = async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM spaces WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ message: 'Espacio no encontrado' });
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ message: 'Error interno', error: error.message });
    }
};

// Crear espacio (Admin)
const createSpace = async (req, res) => {
    const { name, description, image_url } = req.body;
    try {
        const [result] = await pool.query(
            'INSERT INTO spaces (name, description, image_url) VALUES (?, ?, ?)',
            [name, description, image_url]
        );
        logActivity(req.user.id, 'CREATE_SPACE', 'Espacio', result.insertId, result.insertId, { name, description }, req.ip);
        res.status(201).json({ message: 'Espacio creado', id: result.insertId });
    } catch (error) {
        res.status(500).json({ message: 'Error al crear', error: error.message });
    }
};

// Actualizar espacio (Admin)
const updateSpace = async (req, res) => {
    const { name, description, image_url, is_active } = req.body;
    try {
        await pool.query(
            'UPDATE spaces SET name = ?, description = ?, image_url = ?, is_active = ? WHERE id = ?',
            [name, description, image_url, is_active, req.params.id]
        );
        logActivity(req.user.id, 'UPDATE_SPACE', 'Espacio', req.params.id, req.params.id, { name, is_active }, req.ip);
        res.json({ message: 'Espacio actualizado' });
    } catch (error) {
        res.status(500).json({ message: 'Error al actualizar', error: error.message });
    }
};

// Borrar espacio lógicamente (Admin)
const deleteSpace = async (req, res) => {
    try {
        await pool.query('UPDATE spaces SET is_active = FALSE WHERE id = ?', [req.params.id]);
        logActivity(req.user.id, 'DELETE_SPACE', 'Espacio', req.params.id, req.params.id, {}, req.ip);
        res.json({ message: 'Espacio desactivado de forma exitosa' });
    } catch (error) {
        res.status(500).json({ message: 'Error al borrar', error: error.message });
    }
};

module.exports = {
    getAllSpaces,
    getSpaceById,
    createSpace,
    updateSpace,
    deleteSpace
};
