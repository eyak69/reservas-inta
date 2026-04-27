const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configuración de almacenamiento para Espacios
const spaceStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'uploads/spaces';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        // Nombre único: timestamp + nombre original sanitizado
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'space-' + uniqueSuffix + ext);
    }
});

// Filtro de archivos para asegurar que sean imágenes
const imageFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('El archivo debe ser una imagen válida.'), false);
    }
};

const uploadSpaceImage = multer({
    storage: spaceStorage,
    fileFilter: imageFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

module.exports = {
    uploadSpaceImage
};
