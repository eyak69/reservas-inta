const pool = require('../config/db');
const logActivity = require('../utils/logger');
const { sendNotificationEvent } = require('./notificationService');
const { formatHumanDate, formatHumanTime } = require('../utils/dateUtils');

// ─── Declaraciones de tools para Gemini ───────────────────────────────────────
// Todas las tools están declaradas siempre. El system prompt y el guard de rol
// en executeTool son los que controlan el acceso real según el rol del usuario.

const toolDeclarations = [

    // ── Tools disponibles para todos los usuarios autenticados ──────────────
    {
        name: 'mis_reservas',
        description: 'Obtiene las reservas del usuario autenticado. Puede filtrar por rango de fechas y/o estado. Si buscás por un día específico y no encontrás resultados, intentá ampliar el rango ±1 día porque el usuario puede estar recordando la fecha aproximada.',
        parameters: {
            type: 'OBJECT',
            properties: {
                fecha_desde: { type: 'STRING', description: 'Fecha inicio del rango YYYY-MM-DD (opcional)' },
                fecha_hasta: { type: 'STRING', description: 'Fecha fin del rango YYYY-MM-DD (opcional)' },
                estado:      { type: 'STRING', description: 'Estado: pendiente | aprobada | rechazada | cancelada (opcional)' }
            },
            required: []
        }
    },
    {
        name: 'listar_espacios',
        description: 'Devuelve todos los espacios/salas activos del sistema con id, nombre y descripción.',
        parameters: { type: 'OBJECT', properties: {}, required: [] }
    },
    {
        name: 'espacios_disponibles',
        description: 'Verifica qué espacios están libres en un rango horario específico.',
        parameters: {
            type: 'OBJECT',
            properties: {
                fecha:       { type: 'STRING', description: 'Fecha YYYY-MM-DD' },
                hora_inicio: { type: 'STRING', description: 'Hora inicio HH:MM' },
                hora_fin:    { type: 'STRING', description: 'Hora fin HH:MM' }
            },
            required: ['fecha', 'hora_inicio', 'hora_fin']
        }
    },
    {
        name: 'crear_reserva',
        description: 'Crea una nueva reserva para el usuario autenticado. Valida solapamientos antes de insertar.',
        parameters: {
            type: 'OBJECT',
            properties: {
                space_id:    { type: 'STRING', description: 'ID del espacio a reservar (numérico)' },
                fecha:       { type: 'STRING', description: 'Fecha YYYY-MM-DD' },
                hora_inicio: { type: 'STRING', description: 'Hora inicio HH:MM' },
                hora_fin:    { type: 'STRING', description: 'Hora fin HH:MM' },
                comentarios: { type: 'STRING', description: 'Motivo de la reserva (opcional)' }
            },
            required: ['space_id', 'fecha', 'hora_inicio', 'hora_fin']
        }
    },
    {
        name: 'cancelar_reserva',
        description: 'Cancela una reserva. Un usuario solo puede cancelar las propias; un admin puede cancelar cualquiera.',
        parameters: {
            type: 'OBJECT',
            properties: {
                reserva_id: { type: 'STRING', description: 'ID de la reserva a cancelar (numérico)' }
            },
            required: ['reserva_id']
        }
    },

    // ── Tools exclusivas para admin ──────────────────────────────────────────
    {
        name: 'todas_las_reservas',
        description: 'SOLO ADMIN. Lista todas las reservas del sistema con filtros opcionales.',
        parameters: {
            type: 'OBJECT',
            properties: {
                fecha:    { type: 'STRING', description: 'Filtrar por fecha YYYY-MM-DD (opcional)' },
                estado:   { type: 'STRING', description: 'Filtrar por estado (opcional)' },
                busqueda: { type: 'STRING', description: 'Buscar por nombre de usuario, email o espacio (opcional)' }
            },
            required: []
        }
    },
    {
        name: 'aprobar_rechazar_reserva',
        description: 'SOLO ADMIN. Aprueba o rechaza una reserva usando su ID numérico. Extraé el ID de la lista de reservas obtenida previamente.',
        parameters: {
            type: 'OBJECT',
            properties: {
                reserva_id: { type: 'STRING', description: 'ID de la reserva (numérico)' },
                estado:     { type: 'STRING', description: 'Nuevo estado: aprobada | rechazada' }
            },
            required: ['reserva_id', 'estado']
        }
    },
    {
        name: 'gestionar_espacio',
        description: 'SOLO ADMIN. Crea un nuevo espacio o actualiza/desactiva uno existente.',
        parameters: {
            type: 'OBJECT',
            properties: {
                accion:      { type: 'STRING', description: 'Acción a realizar: crear | actualizar | desactivar' },
                space_id:    { type: 'NUMBER', description: 'ID del espacio (requerido para actualizar o desactivar)' },
                nombre:      { type: 'STRING', description: 'Nombre del espacio (requerido para crear o actualizar)' },
                descripcion: { type: 'STRING', description: 'Descripción del espacio (opcional)' },
                image_url:   { type: 'STRING', description: 'URL de imagen del espacio (opcional)' }
            },
            required: ['accion']
        }
    },
    {
        name: 'listar_usuarios',
        description: 'SOLO ADMIN. Lista todos los usuarios del sistema con filtro opcional por nombre o email.',
        parameters: {
            type: 'OBJECT',
            properties: {
                busqueda: { type: 'STRING', description: 'Filtrar por nombre o email (opcional)' }
            },
            required: []
        }
    },
    {
        name: 'gestionar_usuario',
        description: 'SOLO ADMIN. Suspende, reactiva o cambia el rol de un usuario.',
        parameters: {
            type: 'OBJECT',
            properties: {
                accion:  { type: 'STRING', description: 'Acción: suspender | activar | cambiar_rol' },
                user_id: { type: 'NUMBER', description: 'ID del usuario a gestionar' }
            },
            required: ['accion', 'user_id']
        }
    },
    {
        name: 'ver_logs',
        description: 'SOLO ADMIN. Muestra el historial de actividad del sistema con filtros opcionales.',
        parameters: {
            type: 'OBJECT',
            properties: {
                fecha_desde:  { type: 'STRING', description: 'Fecha inicio YYYY-MM-DD (opcional)' },
                fecha_hasta:  { type: 'STRING', description: 'Fecha fin YYYY-MM-DD (opcional)' },
                usuario:      { type: 'STRING', description: 'Filtrar por nombre o email de usuario (opcional)' },
                accion:       { type: 'STRING', description: 'Filtrar por tipo de acción (opcional)' }
            },
            required: []
        }
    },
    {
        name: "generate_link_token",
        description: "Genera un código de 6 caracteres para vincular la cuenta de Telegram del usuario actual. Usalo cuando el usuario pregunte cómo conectar su Telegram o pida un código de vinculación.",
        parameters: {
            type: "object",
            properties: {},
            required: []
        }
    }
];

// ─── Guard de permisos ─────────────────────────────────────────────────────────
const TOOLS_ADMIN = new Set([
    'todas_las_reservas',
    'aprobar_rechazar_reserva',
    'gestionar_espacio',
    'listar_usuarios',
    'gestionar_usuario',
    'ver_logs'
]);

// ─── Implementaciones ──────────────────────────────────────────────────────────

async function mis_reservas({ fecha_desde, fecha_hasta, estado }, userId) {
    async function query(fd, fh) {
        const whereChunks = ['r.user_id = ?'];
        const params = [userId];
        if (fd)     { whereChunks.push('DATE(r.start_time) >= ?'); params.push(fd); }
        if (fh)     { whereChunks.push('DATE(r.start_time) <= ?'); params.push(fh); }
        if (estado) { whereChunks.push('r.status = ?');            params.push(estado); }
        const [rows] = await pool.query(`
            SELECT r.id AS reserva_id, s.name AS espacio, r.start_time AS inicio, r.end_time AS fin,
                   r.status AS estado, r.comments AS comentarios
            FROM reservations r
            JOIN spaces s ON r.space_id = s.id
            WHERE ${whereChunks.join(' AND ')}
            ORDER BY r.start_time DESC
            LIMIT 20
        `, params);
        return rows;
    }

    let rows = await query(fecha_desde, fecha_hasta);

    // Si buscó por día exacto y no encontró nada, reintenta ±7 días
    // (el modelo suele calcular "el miércoles" como el próximo, pero puede ser el pasado)
    if (rows.length === 0 && fecha_desde && fecha_desde === fecha_hasta) {
        const d = new Date(fecha_desde + 'T00:00:00');
        const prev = new Date(d); prev.setDate(prev.getDate() - 7);
        const next = new Date(d); next.setDate(next.getDate() + 7);
        const fmt  = d => d.toISOString().split('T')[0];
        rows = await query(fmt(prev), fmt(next));
    }

    if (rows.length === 0) return { resultado: 'No encontré reservas con esos criterios.' };
    return { reservas: rows };
}

async function listar_espacios() {
    const [rows] = await pool.query(
        'SELECT id, name AS nombre, description AS descripcion FROM spaces WHERE is_active = 1 ORDER BY name ASC'
    );
    if (rows.length === 0) return { resultado: 'No hay espacios cargados en el sistema.' };
    return { espacios: rows };
}

async function espacios_disponibles({ fecha, hora_inicio, hora_fin }) {
    const start_time = `${fecha} ${hora_inicio}:00`;
    const end_time   = `${fecha} ${hora_fin}:00`;

    const [todos] = await pool.query(
        'SELECT id, name AS nombre, description AS descripcion FROM spaces WHERE is_active = 1'
    );
    const [ocupados] = await pool.query(`
        SELECT DISTINCT space_id FROM reservations
        WHERE status IN ('aprobada', 'pendiente')
        AND (
            (start_time <= ? AND end_time > ?) OR
            (start_time < ?  AND end_time >= ?) OR
            (start_time >= ? AND end_time <= ?)
        )
    `, [start_time, start_time, end_time, end_time, start_time, end_time]);

    const idsOcupados = new Set(ocupados.map(r => r.space_id));
    const disponibles = todos.filter(e => !idsOcupados.has(e.id));

    if (disponibles.length === 0)
        return { resultado: `No hay espacios disponibles el ${fecha} de ${hora_inicio} a ${hora_fin}.` };
    return { espacios_disponibles: disponibles };
}

async function crear_reserva({ space_id, fecha, hora_inicio, hora_fin, comentarios }, userId, userIp) {
    const start_time = `${fecha} ${hora_inicio}:00`;
    const end_time   = `${fecha} ${hora_fin}:00`;

    if (new Date(start_time) >= new Date(end_time))
        return { error: 'La hora de fin debe ser posterior a la de inicio.' };

    const [espacios] = await pool.query(
        'SELECT name FROM spaces WHERE id = ? AND is_active = 1', [space_id]
    );
    if (espacios.length === 0) return { error: 'El espacio indicado no existe o está inactivo.' };

    const [conflicts] = await pool.query(`
        SELECT id FROM reservations
        WHERE space_id = ? AND status IN ('aprobada', 'pendiente')
        AND (
            (start_time <= ? AND end_time > ?) OR
            (start_time < ?  AND end_time >= ?) OR
            (start_time >= ? AND end_time <= ?)
        )
    `, [space_id, start_time, start_time, end_time, end_time, start_time, end_time]);

    if (conflicts.length > 0)
        return { error: 'El espacio ya tiene una reserva en ese horario. Probá con otro horario o espacio.' };

    const [result] = await pool.query(
        'INSERT INTO reservations (user_id, space_id, start_time, end_time, status, comments) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, space_id, start_time, end_time, 'pendiente', comentarios || '']
    );
    logActivity(userId, 'CREATE_RESERVATION', 'Reserva', result.insertId, space_id, { start_time, end_time, via: 'chat' }, userIp);

    // Notificar a los admins (Regla 12)
    const [[user]] = await pool.query('SELECT name FROM users WHERE id = ?', [userId]);
    const motivoStr = comentarios ? `\n📝 Motivo: ${comentarios}` : '';
    const fechaHumana = formatHumanDate(start_time);
    const rangoHorario = `${formatHumanTime(start_time)} a ${formatHumanTime(end_time)}`;
    
    await sendNotificationEvent({
        title: 'Nueva Reserva Pendiente',
        message: `👤 Usuario: ${user.name}\n📍 Espacio: ${espacios[0].nombre}\n📅 Fecha: ${fechaHumana}\n⏰ Horario: ${rangoHorario} hs${motivoStr}`,
        toAdmins: true,
        type: 'info'
    });

    return {
        resultado: `Reserva #${result.insertId} creada para "${espacios[0].nombre}" el ${fecha} de ${hora_inicio} a ${hora_fin}. Queda pendiente de aprobación.`,
        reserva_id: result.insertId
    };
}

async function cancelar_reserva({ reserva_id }, userId, userRole) {
    if (!reserva_id) return { error: 'Falta el reserva_id. Por favor, pedile al usuario que especifique cuál cancelar o mirá en sus reservas recientes.' };

    const [rows] = await pool.query(
        'SELECT user_id, space_id, status FROM reservations WHERE id = ?', [reserva_id]
    );
    if (rows.length === 0) return { error: 'No encontré una reserva con ese ID.' };

    // Un usuario solo puede cancelar las propias; admin puede cancelar cualquiera
    if (userRole !== 'admin' && rows[0].user_id !== userId)
        return { error: 'Solo podés cancelar tus propias reservas.' };

    if (!['pendiente', 'aprobada'].includes(rows[0].status))
        return { error: `La reserva ya está en estado "${rows[0].status}" y no puede cancelarse.` };

    await pool.query('UPDATE reservations SET status = "cancelada" WHERE id = ?', [reserva_id]);
    logActivity(userId, 'CANCEL_RESERVATION', 'Reserva', reserva_id, rows[0].space_id, { via: 'chat' }, null);

    // Notificar al dueño de la reserva
    await sendNotificationEvent({
        userId: rows[0].user_id,
        title: 'Reserva Cancelada',
        message: `🚫 Tu reserva #${reserva_id} ha sido CANCELADA.`,
        type: 'warning'
    });

    return { resultado: 'Reserva cancelada exitosamente.' };
}

// ── Admin tools ──────────────────────────────────────────────────────────────

async function todas_las_reservas({ fecha, estado, busqueda }) {
    let whereChunks = [];
    let params = [];

    if (fecha)    { whereChunks.push('DATE(r.start_time) = ?'); params.push(fecha); }
    if (estado)   { whereChunks.push('r.status = ?');           params.push(estado); }
    if (busqueda) {
        whereChunks.push('(u.name LIKE ? OR u.email LIKE ? OR s.name LIKE ?)');
        const s = `%${busqueda}%`;
        params.push(s, s, s);
    }

    const where = whereChunks.length ? `WHERE ${whereChunks.join(' AND ')}` : '';
    const [rows] = await pool.query(`
        SELECT r.id AS reserva_id, u.name AS usuario, u.email, s.name AS espacio,
               r.start_time AS inicio, r.end_time AS fin,
               r.status AS estado, r.comments AS comentarios
        FROM reservations r
        JOIN users u  ON r.user_id  = u.id
        JOIN spaces s ON r.space_id = s.id
        ${where}
        ORDER BY r.start_time DESC
        LIMIT 25
    `, params);

    if (rows.length === 0) return { resultado: 'No hay reservas con esos criterios.' };
    return { reservas: rows, total: rows.length };
}

async function aprobar_rechazar_reserva({ reserva_id, estado }, adminId, userIp) {
    if (!['aprobada', 'rechazada'].includes(estado))
        return { error: 'El estado debe ser "aprobada" o "rechazada".' };

    const [rows] = await pool.query('SELECT space_id, status, user_id FROM reservations WHERE id = ?', [reserva_id]);
    if (rows.length === 0) return { error: 'No encontré una reserva con ese ID.' };
    if (rows[0].status === 'cancelada')
        return { error: 'No se puede modificar una reserva cancelada.' };

    await pool.query('UPDATE reservations SET status = ? WHERE id = ?', [estado, reserva_id]);
    logActivity(adminId, 'UPDATE_RESERVATION_STATUS', 'Reserva', reserva_id, rows[0].space_id, { estado, via: 'chat' }, userIp);

    // Notificar al usuario sobre el cambio de estado
    const emoji = estado === 'aprobada' ? '✅' : '❌';
    await sendNotificationEvent({
        userId: rows[0].user_id,
        title: `Reserva ${estado.toUpperCase()}`,
        message: `${emoji} Tu reserva #${reserva_id} ha sido ${estado.toUpperCase()}.`,
        type: estado === 'aprobada' ? 'success' : 'error'
    });

    return { resultado: `Reserva #${reserva_id} marcada como "${estado}".` };
}

async function gestionar_espacio({ accion, space_id, nombre, descripcion, image_url }, adminId, userIp) {
    if (accion === 'crear') {
        if (!nombre) return { error: 'El nombre es obligatorio para crear un espacio.' };
        const [result] = await pool.query(
            'INSERT INTO spaces (name, description, image_url) VALUES (?, ?, ?)',
            [nombre, descripcion || '', image_url || '']
        );
        logActivity(adminId, 'CREATE_SPACE', 'Espacio', result.insertId, result.insertId, { nombre, via: 'chat' }, userIp);
        return { resultado: `Espacio "${nombre}" creado con ID ${result.insertId}.` };
    }

    if (accion === 'actualizar') {
        if (!space_id) return { error: 'Se requiere el ID del espacio para actualizarlo.' };
        if (!nombre)   return { error: 'Se requiere el nombre para actualizar el espacio.' };
        const [rows] = await pool.query('SELECT image_url FROM spaces WHERE id = ?', [space_id]);
        if (rows.length === 0) return { error: 'No encontré un espacio con ese ID.' };
        await pool.query(
            'UPDATE spaces SET name = ?, description = ?, image_url = ? WHERE id = ?',
            [nombre, descripcion || '', image_url || rows[0].image_url, space_id]
        );
        logActivity(adminId, 'UPDATE_SPACE', 'Espacio', space_id, space_id, { nombre, via: 'chat' }, userIp);
        return { resultado: `Espacio #${space_id} actualizado.` };
    }

    if (accion === 'desactivar') {
        if (!space_id) return { error: 'Se requiere el ID del espacio para desactivarlo.' };
        await pool.query('UPDATE spaces SET is_active = FALSE WHERE id = ?', [space_id]);
        logActivity(adminId, 'DELETE_SPACE', 'Espacio', space_id, space_id, { via: 'chat' }, userIp);
        return { resultado: `Espacio #${space_id} desactivado exitosamente.` };
    }

    return { error: `Acción desconocida: "${accion}". Usá crear, actualizar o desactivar.` };
}

async function listar_usuarios({ busqueda }) {
    let where = '';
    let params = [];
    if (busqueda) {
        where = 'WHERE name LIKE ? OR email LIKE ?';
        params.push(`%${busqueda}%`, `%${busqueda}%`);
    }
    const [rows] = await pool.query(`
        SELECT id, name AS nombre, email, role AS rol,
               is_active AS activo, created_at AS creado
        FROM users
        ${where}
        ORDER BY id DESC
        LIMIT 20
    `, params);

    if (rows.length === 0) return { resultado: 'No encontré usuarios con esos criterios.' };
    return { usuarios: rows };
}

async function gestionar_usuario({ accion, user_id }, adminId, userIp) {
    if (user_id === adminId)
        return { error: 'No podés gestionar tu propio usuario desde el chat.' };

    const [rows] = await pool.query('SELECT name, role, is_active FROM users WHERE id = ?', [user_id]);
    if (rows.length === 0) return { error: 'No encontré un usuario con ese ID.' };

    const { name, role, is_active } = rows[0];

    if (accion === 'suspender') {
        if (role === 'admin') return { error: 'No se puede suspender a otro administrador.' };
        if (!is_active)       return { resultado: `El usuario "${name}" ya está suspendido.` };
        await pool.query('UPDATE users SET is_active = FALSE WHERE id = ?', [user_id]);
        logActivity(adminId, 'SUSPEND_USER', 'Usuario', user_id, null, { via: 'chat' }, userIp);
        return { resultado: `Usuario "${name}" suspendido.` };
    }

    if (accion === 'activar') {
        if (is_active) return { resultado: `El usuario "${name}" ya está activo.` };
        await pool.query('UPDATE users SET is_active = TRUE WHERE id = ?', [user_id]);
        logActivity(adminId, 'ACTIVATE_USER', 'Usuario', user_id, null, { via: 'chat' }, userIp);
        return { resultado: `Usuario "${name}" activado.` };
    }

    if (accion === 'cambiar_rol') {
        const nuevoRol = role === 'admin' ? 'usuario' : 'admin';
        await pool.query('UPDATE users SET role = ? WHERE id = ?', [nuevoRol, user_id]);
        logActivity(adminId, 'CHANGE_ROLE', 'Usuario', user_id, null, { nuevoRol, via: 'chat' }, userIp);
        return { resultado: `Rol de "${name}" cambiado a "${nuevoRol}".` };
    }

    return { error: `Acción desconocida: "${accion}". Usá suspender, activar o cambiar_rol.` };
}

async function ver_logs({ fecha_desde, fecha_hasta, usuario, accion }) {
    let whereClauses = [];
    let params = [];

    if (fecha_desde) { whereClauses.push('l.created_at >= ?'); params.push(`${fecha_desde} 00:00:00`); }
    if (fecha_hasta) { whereClauses.push('l.created_at <= ?'); params.push(`${fecha_hasta} 23:59:59`); }
    if (usuario)     { whereClauses.push('(u.name LIKE ? OR u.email LIKE ?)'); params.push(`%${usuario}%`, `%${usuario}%`); }
    if (accion)      { whereClauses.push('l.action LIKE ?'); params.push(`%${accion}%`); }

    const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const [rows] = await pool.query(`
        SELECT l.id, l.action AS accion, l.entity AS entidad, l.ip_address AS ip,
               l.created_at AS fecha, u.name AS usuario, u.email
        FROM activity_logs l
        JOIN users u ON l.user_id = u.id
        ${where}
        ORDER BY l.created_at DESC
        LIMIT 20
    `, params);

    if (rows.length === 0) return { resultado: 'No hay registros de auditoría con esos filtros.' };
    return { logs: rows };
}

// ─── Dispatcher principal ──────────────────────────────────────────────────────

async function executeTool(toolName, toolArgs, userId, userRole, userIp) {
    // Normalización de fechas (Regla 11: Resiliencia)
    const normalizeDate = (str) => {
        if (!str || typeof str !== 'string') return str;
        // Detectar DD-MM-YYYY o DD/MM/YYYY
        const latinMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
        if (latinMatch) {
            const [, day, month, year] = latinMatch;
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        return str;
    };

    // Normalizar args para modelos que mandan null (como Llama-3) o tipos incorrectos
    const sanitizedArgs = {};
    for (const [key, value] of Object.entries(toolArgs || {})) {
        if (value === null) continue;
        
        // Normalizar fechas
        if (['fecha', 'fecha_desde', 'fecha_hasta'].includes(key)) {
            sanitizedArgs[key] = normalizeDate(value);
            continue;
        }

        // Forzar numéricos donde sabemos que deben serlo (Regla 11: Resiliencia)
        if (['space_id', 'reserva_id', 'user_id', 'usuario_id'].includes(key)) {
            const num = Number(value);
            sanitizedArgs[key] = isNaN(num) ? value : num;
        } else {
            sanitizedArgs[key] = value;
        }
    }
    
    console.log(`[ChatService] 🛠 Tool: ${toolName} | Args:`, JSON.stringify(sanitizedArgs));

    // Guard de permisos: si la tool es de admin y el usuario no lo es, rechazar
    if (TOOLS_ADMIN.has(toolName) && userRole !== 'admin') {
        return { error: 'No tenés permisos para realizar esta acción. Se requiere rol de administrador.' };
    }

    switch (toolName) {
        case 'mis_reservas':            return await mis_reservas(sanitizedArgs, userId);
        case 'listar_espacios':         return await listar_espacios();
        case 'espacios_disponibles':    return await espacios_disponibles(sanitizedArgs);
        case 'crear_reserva':           return await crear_reserva(sanitizedArgs, userId, userIp);
        case 'cancelar_reserva':        return await cancelar_reserva(sanitizedArgs, userId, userRole);
        case 'todas_las_reservas':      return await todas_las_reservas(sanitizedArgs);
        case 'aprobar_rechazar_reserva':return await aprobar_rechazar_reserva(sanitizedArgs, userId, userIp);
        case 'gestionar_espacio':       return await gestionar_espacio(sanitizedArgs, userId, userIp);
        case 'listar_usuarios':         return await listar_usuarios(sanitizedArgs);
        case 'gestionar_usuario':       return await gestionar_usuario(sanitizedArgs, userId, userIp);
        case 'ver_logs':                return await ver_logs(sanitizedArgs);
        case 'generate_link_token': {
            const token = Math.random().toString(36).substring(2, 8).toUpperCase();
            await pool.query(
                'UPDATE users SET link_token = ?, link_token_expiry = DATE_ADD(NOW(), INTERVAL 15 MINUTE) WHERE id = ?',
                [token, userId]
            );
            return { 
                message: `Tu código de vinculación es: ${token}`, 
                instructions: "Copiá este código y mandáselo al bot de Telegram escribiendo: /vincular " + token 
            };
        }
        default:                        return { error: `Tool desconocida: ${toolName}` };
    }
}

module.exports = { toolDeclarations, executeTool, TOOLS_ADMIN };
