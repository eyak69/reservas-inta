const fs = require('fs');
const path = require('path');

/**
 * Asegura que los directorios necesarios existan al arrancar la aplicación. (Regla 14)
 */
function ensureDirectories() {
    const rootDirs = [
        path.join(__dirname, '../../logs'),
        path.join(__dirname, '../../storage')
    ];

    const backendDirs = [
        path.join(__dirname, '../uploads'),
        path.join(__dirname, '../uploads/spaces')
    ];

    const allDirs = [...rootDirs, ...backendDirs];

    allDirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            console.log(`[DirInit] Creando directorio faltante: ${dir}`);
            fs.mkdirSync(dir, { recursive: true });
        }
    });

    // Asegurar permisos (especialmente útil en entornos Linux/Docker)
    try {
        allDirs.forEach(dir => {
            fs.chmodSync(dir, '777');
        });
    } catch (err) {
        // En Windows puede fallar o ser innecesario, lo capturamos silenciosamente
        // console.warn('[DirInit] No se pudieron ajustar permisos de forma explícita:', err.message);
    }
}

module.exports = { ensureDirectories };
