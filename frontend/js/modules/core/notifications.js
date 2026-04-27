import { showToast } from './ui.js';
import { getCurrentUser } from './state.js';
import { apiFetch, API_URL } from './api.js';

let socket;
let unreadCount = 0;

export function initNotifications() {
    const user = getCurrentUser();
    if (!user) return;

    // Inicializar socket
    socket = io();

    const authenticate = () => {
        console.log(`[Notifications] 🔑 Autenticando socket... Usuario: ${user.name}, Rol: ${user.role}`);
        socket.emit('authenticate', { 
            userId: user.id, 
            role: user.role 
        });
    };

    socket.on('connect', () => {
        console.log('[Notifications] 🔌 Socket conectado con ID:', socket.id);
        authenticate();
    });

    socket.on('reconnect', () => {
        console.log('[Notifications] 🔄 Socket reconectado');
        authenticate();
    });

    // Escuchar notificaciones generales (admins)
    socket.on('notification', (data) => {
        handleIncomingNotification(data);
    });

    // Escuchar notificaciones personales
    socket.on(`notification_${user.id}`, (data) => {
        handleIncomingNotification(data);
    });

    // Setup UI de la campana
    setupNotificationUI();
    
    // Cargar historial inicial (Regla 4)
    loadNotificationHistory();
}

function handleIncomingNotification(data) {
    unreadCount++;
    updateBadge();
    addNotificationToList(data, true);
    
    // Mostrar Toast (Regla 1)
    showToast(`${data.title}: ${data.message.substring(0, 50)}...`, data.type || 'info');
    
    // Opcional: Sonido sutil (Regla 1)
    playNotificationSound();
}

function setupNotificationUI() {
    const btn = document.getElementById('btn-notifications');
    const panel = document.getElementById('notif-panel');
    
    if (btn && panel) {
        btn.onclick = (e) => {
            e.stopPropagation();
            panel.classList.toggle('hidden');
            if (!panel.classList.contains('hidden')) {
                // Al abrir, podríamos marcar como leídas, pero mejor dejarlo al botón "Limpiar"
            }
        };

        // Cerrar al hacer clic afuera
        document.addEventListener('click', (e) => {
            if (!panel.contains(e.target) && !btn.contains(e.target)) {
                panel.classList.add('hidden');
            }
        });
    }

    // Exponer globalmente para el botón del HTML
    window.markAllNotificationsRead = markAllAsRead;
}

async function loadNotificationHistory() {
    try {
        const response = await apiFetch(`${API_URL}/notifications`);
        if (response && response.ok) {
            const notifications = await response.json();
            const list = document.getElementById('notif-list');
            if (notifications.length > 0) {
                list.innerHTML = '';
                notifications.forEach(n => addNotificationToList(n));
                unreadCount = notifications.filter(n => !n.is_read).length;
                updateBadge();
            }
        }
    } catch (err) {
        console.error('Error cargando notificaciones:', err);
    }
}

function addNotificationToList(data, isNew = false) {
    const list = document.getElementById('notif-list');
    if (!list) return;

    // Quitar mensaje de "vacío" si existe
    if (list.querySelector('.notifications_off')) {
        list.innerHTML = '';
    }

    const item = document.createElement('div');
    item.className = `p-4 hover:bg-white/5 transition-colors cursor-default ${isNew ? 'bg-primary/5 animate-pulse' : ''}`;
    
    const iconMap = {
        success: 'check_circle',
        error: 'error',
        warning: 'warning',
        info: 'info'
    };
    const icon = iconMap[data.type] || 'notifications';
    const colorClass = data.type === 'success' ? 'text-emerald-500' : 
                       data.type === 'error' ? 'text-red-500' : 
                       data.type === 'warning' ? 'text-amber-500' : 'text-primary';

    item.innerHTML = `
        <div class="flex gap-3">
            <span class="material-symbols-outlined ${colorClass} text-[20px]">${icon}</span>
            <div class="flex-1">
                <p class="text-xs font-bold text-white mb-1">${data.title}</p>
                <p class="text-[11px] text-slate-400 leading-relaxed">${data.message}</p>
                <p class="text-[9px] text-slate-600 mt-2">${new Date(data.created_at).toLocaleString()}</p>
            </div>
        </div>
    `;

    if (isNew) {
        list.prepend(item);
        setTimeout(() => item.classList.remove('animate-pulse', 'bg-primary/5'), 3000);
    } else {
        list.appendChild(item);
    }
}

function updateBadge() {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    
    if (unreadCount > 0) {
        badge.innerText = unreadCount > 99 ? '99+' : unreadCount;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

async function markAllAsRead() {
    try {
        await apiFetch(`${API_URL}/notifications/read-all`, { method: 'POST' });
        unreadCount = 0;
        updateBadge();
        const list = document.getElementById('notif-list');
        list.innerHTML = `
            <div class="p-8 text-center">
                <span class="material-symbols-outlined text-slate-600 text-4xl block mb-2">notifications_off</span>
                <p class="text-xs text-slate-500">No hay notificaciones nuevas</p>
            </div>
        `;
    } catch (err) {
        console.error('Error al limpiar notificaciones:', err);
    }
}

function playNotificationSound() {
    // Solo si el usuario interactuó antes con la página (política de navegadores)
    try {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
        audio.volume = 0.3;
        audio.play();
    } catch (e) {
        // Ignorar si el navegador bloquea el autoplay
    }
}
