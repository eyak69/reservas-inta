const dns = require('dns').promises;

/**
 * Valida que un email no sea "verdura" (ficticio).
 * 1. Formato sintáctico (Regex)
 * 2. Existencia de registros MX en el dominio (DNS)
 */
async function validateEmailRealness(email) {
    if (!email || typeof email !== 'string') return false;

    // 1. Sintaxis básica
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return false;

    // 2. Extraer dominio
    const domain = email.split('@')[1];
    
    try {
        // 3. Verificar registros MX (Mail Exchange)
        // Esto confirma que el dominio puede recibir correos.
        const mxRecords = await dns.resolveMx(domain);
        return mxRecords && mxRecords.length > 0;
    } catch (error) {
        // Si el DNS falla (ENOTFOUND), el dominio no existe.
        return false;
    }
}

module.exports = { validateEmailRealness };
