/**
 * Helpers para formateo de fechas y tiempos consistentes en todo el sistema.
 * Centralizado para evitar dependencias circulares. (Regla 8 y 12)
 */

function formatHumanDate(isoString) {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'America/Argentina/Buenos_Aires'
    }).format(date);
}

function formatHumanTime(isoString) {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return date.toLocaleTimeString('es-AR', { 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: false,
        timeZone: 'America/Argentina/Buenos_Aires'
    });
}

module.exports = { formatHumanDate, formatHumanTime };
