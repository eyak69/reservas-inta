const xss = require('xss');

// Middleware para sanitizar (limpiar) de scripts maliciosos todas las entradas del usuario (body, query, params)
const xssSanitizer = (req, res, next) => {
    // Si es una carga de archivos, no sanitizamos aquí (lo maneja multer y el controlador luego si es necesario)
    if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
        return next();
    }

    if (req.body) {
        for (const key in req.body) {
            if (typeof req.body[key] === 'string') {
                req.body[key] = xss(req.body[key]);
            }
        }
    }

    if (req.query) {
        for (const key in req.query) {
            if (typeof req.query[key] === 'string') {
                req.query[key] = xss(req.query[key]);
            }
        }
    }

    if (req.params) {
        for (const key in req.params) {
            if (typeof req.params[key] === 'string') {
                req.params[key] = xss(req.params[key]);
            }
        }
    }

    next();
};

module.exports = { xssSanitizer };
