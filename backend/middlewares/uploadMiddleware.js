const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

// Almacenar temporalmente en RAM para que Sharp lo procese (sin tocar el disco duro aún)
const memoryStorage = multer.memoryStorage();

// Filtro de archivos para asegurar que sean imágenes
const imageFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('El archivo debe ser una imagen válida.'), false);
    }
};

const uploadSpaceImage = multer({
    storage: memoryStorage,
    fileFilter: imageFilter,
    limits: { fileSize: 20 * 1024 * 1024 } // Aumentamos límite inicial a 20MB para permitir fotos directo del celular
});

// Middleware de procesamiento con Sharp (Reducción y conversión a WebP)
const resizeAndSaveSpaceImage = async (req, res, next) => {
    if (!req.file) return next();

    // Usar ruta absoluta basada en __dirname para evitar desajustes con process.cwd() en Docker
    const dir = path.join(__dirname, '../uploads/spaces');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    // Convertimos siempre a WebP para máxima compresión y calidad (Regla 7)
    const filename = `space-${uniqueSuffix}.webp`;
    const filepath = path.join(dir, filename);

    try {
        await sharp(req.file.buffer)
            .resize(1280, 720, { 
                fit: 'inside', // Mantiene proporción sin deformar, máximo 1280x720
                withoutEnlargement: true 
            })
            .webp({ quality: 80 }) // 80% de calidad WebP suele pesar poquísimo
            .toFile(filepath);

        // Mutamos req.file para que el controlador crea que Multer lo guardó normalmente
        req.file.filename = filename;
        req.file.path = filepath;
        req.file.mimetype = 'image/webp';
        
        next();
    } catch (error) {
        console.error('[UploadMiddleware] Error al procesar imagen con sharp:', error);
        return res.status(500).json({ message: 'Error procesando la imagen de alta resolución', error: error.message });
    }
};

module.exports = {
    uploadSpaceImage,
    resizeAndSaveSpaceImage
};
