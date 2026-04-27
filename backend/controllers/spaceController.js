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
    const { name, description } = req.body;
    let { image_url } = req.body;

    // Si se subió un archivo, este tiene prioridad
    if (req.file) {
        image_url = `/uploads/spaces/${req.file.filename}`;
    }

    console.log('[SpaceController] Creando espacio:', { name, image_url, hasFile: !!req.file });

    try {
        const [result] = await pool.query(
            'INSERT INTO spaces (name, description, image_url, is_active) VALUES (?, ?, ?, true)',
            [name, description, image_url]
        );
        logActivity(req.user.id, 'CREATE_SPACE', 'Espacio', result.insertId, result.insertId, { name, image_url }, req.ip);
        res.status(201).json({ message: 'Espacio creado', id: result.insertId });
    } catch (error) {
        console.error('[SpaceController] Error al crear espacio:', error);
        res.status(500).json({ message: 'Error al crear', error: error.message });
    }
};

// Actualizar espacio (Admin)
const updateSpace = async (req, res) => {
    const { name, description } = req.body;
    let { image_url, is_active } = req.body;

    console.log('[SpaceController] Actualizando espacio:', req.params.id, { name, image_url, is_active, hasFile: !!req.file });

    // Si se subió un archivo, actualizamos la URL
    if (req.file) {
        image_url = `/uploads/spaces/${req.file.filename}`;
    }

    // Convertir is_active a boolean/number (viene como string de FormData)
    const activeVal = is_active === 'true' || is_active === true || is_active === '1' ? 1 : 0;

    try {
        // Primero obtener el estado actual para no borrar la imagen si no se envía una nueva
        if (image_url === undefined) {
            const [rows] = await pool.query('SELECT image_url FROM spaces WHERE id = ?', [req.params.id]);
            if (rows.length > 0) image_url = rows[0].image_url;
        }

        await pool.query(
            'UPDATE spaces SET name = ?, description = ?, image_url = ?, is_active = ? WHERE id = ?',
            [name, description, image_url, activeVal, req.params.id]
        );
        logActivity(req.user.id, 'UPDATE_SPACE', 'Espacio', req.params.id, req.params.id, { name, image_url, is_active: activeVal }, req.ip);
        res.json({ message: 'Espacio actualizado' });
    } catch (error) {
        console.error('[SpaceController] Error al actualizar espacio:', error);
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
