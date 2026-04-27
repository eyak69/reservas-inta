import { API_URL, apiFetch } from '../core/api.js';
import { showToast, escapeHTML } from '../core/ui.js';
import { updateReservationStatus, cancelReservation } from './reservations.js';
import { openModal } from './dashboard.js';

export async function loadCalendar() {
    const main = document.getElementById('main-content');
    
    main.innerHTML = `
        <section class="h-full flex flex-col">
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-xl font-bold">Calendario de Ocupación</h2>
                <button onclick="openModal()" class="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-xl font-bold transition-colors shadow-lg shadow-primary/30">
                    <span class="material-symbols-outlined text-sm">add_circle</span>
                    Nueva Reserva
                </button>
            </div>
            <div class="glass-card p-4 rounded-xl flex-1 min-h-[500px] overflow-hidden relative">
                <div id="calendar" class="h-full pt-2"></div>
                <!-- Popup de Reserva (Hidden by default) -->
                <div id="reservation-popup" class="hidden absolute z-[100] w-[320px] glass-card rounded-2xl shadow-2xl border border-white/10 overflow-hidden animate-in fade-in zoom-in duration-200">
                    <div id="popup-content"></div>
                </div>
            </div>
        </section>
    `;

    try {
        const res = await apiFetch(`${API_URL}/reservations/calendar`);
        if (!res || !res.ok) throw new Error();
        const eventsData = await res.json();

        const events = eventsData.map(r => ({
            id: r.id,
            title: `${r.space_name} (${r.user_name.split(' ')[0]})`,
            start: r.start_time,
            end: r.end_time,
            color: r.status === 'aprobada' ? '#10b981' : '#f59e0b',
            extendedProps: { 
                status: r.status, 
                description: r.description,
                userName: r.user_name,
                userEmail: r.user_email,
                userId: r.user_id,
                spaceName: r.space_name
            }
        }));

        const isMobile = window.innerWidth < 768;
        const calendarEl = document.getElementById('calendar');
        const calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: isMobile ? 'timeGridDay' : 'timeGridWeek',
            locale: 'es',
            selectable: true,
            selectMirror: true,
            headerToolbar: isMobile
                ? { left: 'prev,next', center: 'title', right: 'today' }
                : { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' },
            footerToolbar: isMobile ? { center: 'dayGridMonth,timeGridWeek,timeGridDay' } : false,
            buttonText: { today: 'Hoy', month: 'Mes', week: 'Sem', day: 'Día' },
            slotMinTime: '08:00:00',
            slotMaxTime: '22:00:00',
            allDaySlot: false,
            displayEventTime: true,
            displayEventEnd: true,
            eventTimeFormat: { hour: '2-digit', minute: '2-digit', meridiem: false },
            events,
            eventContent: function (arg) {
                const timeText = arg.timeText;
                const descHtml = arg.event.extendedProps.description && !isMobile
                    ? `<div class="text-[10px] opacity-80 italic line-clamp-2 mt-0.5">${arg.event.extendedProps.description}</div>`
                    : '';
                return { html: `<div class="px-1 py-0.5 w-full h-full overflow-hidden flex flex-col"><div class="font-bold text-xs truncate">${arg.event.title}</div><div class="text-[10px] opacity-90">${timeText}</div>${descHtml}</div>` };
            },
            eventClick: function (info) {
                showReservationPopup(info);
            },
            select: function (info) {
                if (info.allDay) {
                    calendar.unselect();
                    return;
                }
                openModal(null, info.startStr, info.endStr);
                calendar.unselect();
            },
            selectAllow: function (selectInfo) {
                return !selectInfo.allDay;
            }
        });
        calendar.render();

        // Close popup when clicking outside
        document.addEventListener('mousedown', (e) => {
            const popup = document.getElementById('reservation-popup');
            if (popup && !popup.contains(e.target) && !e.target.closest('.fc-event') && !e.target.closest('.fc-highlight')) {
                popup.classList.add('hidden');
            }
        });

    } catch (e) {
        showToast('Error cargando el calendario', 'error');
    }
}

function showReservationPopup(info) {
    const event = info.event;
    const props = event.extendedProps;
    const popup = document.getElementById('reservation-popup');
    const content = document.getElementById('popup-content');
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    const isAdmin = currentUser.role === 'admin';
    const isOwner = props.userId === currentUser.id;

    const dateStr = event.start.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });
    const timeStr = `${event.start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} - ${event.end.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;

    const statusClasses = {
        'pendiente': 'bg-amber-500/10 text-amber-400 border-amber-500/30',
        'aprobada': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
        'rechazada': 'bg-red-500/10 text-red-400 border-red-500/30',
        'cancelada': 'bg-slate-500/10 text-slate-400 border-slate-500/30'
    };

    content.innerHTML = `
        <div class="p-4 space-y-4">
            <div class="flex justify-between items-start">
                <div class="min-w-0 flex-1">
                    <h3 class="font-black text-white text-base truncate">${escapeHTML(props.spaceName)}</h3>
                    <span class="text-[9px] uppercase tracking-widest font-black px-2 py-0.5 rounded-md border ${statusClasses[props.status]}">${props.status}</span>
                </div>
                <button onclick="document.getElementById('reservation-popup').classList.add('hidden')" class="text-slate-500 hover:text-white">
                    <span class="material-symbols-outlined text-xl">close</span>
                </button>
            </div>

            <div class="space-y-2">
                <div class="flex items-center gap-2 text-xs text-slate-300">
                    <span class="material-symbols-outlined text-sm text-primary">person</span>
                    <span class="truncate font-bold">${escapeHTML(props.userName)}</span>
                </div>
                <div class="flex items-center gap-2 text-[10px] text-slate-400 font-mono pl-6">
                    <span class="truncate">${escapeHTML(props.userEmail)}</span>
                </div>
                <div class="flex items-center gap-2 text-xs text-slate-300">
                    <span class="material-symbols-outlined text-sm text-primary">calendar_today</span>
                    <span>${dateStr}</span>
                    <span class="opacity-30">•</span>
                    <span>${timeStr}</span>
                </div>
            </div>

            ${props.description ? `
            <div class="p-2.5 bg-black/20 rounded-xl border border-white/5 text-[11px] text-slate-400 italic">
                "${escapeHTML(props.description)}"
            </div>
            ` : ''}

            <div class="flex flex-col gap-2 pt-2 border-t border-white/10">
                ${isAdmin && props.status === 'pendiente' ? `
                <div class="flex gap-2">
                    <button onclick="handlePopupAction('approve', ${event.id})" class="flex-1 h-9 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-400 hover:text-white rounded-lg text-[10px] font-black transition-all flex items-center justify-center gap-1">
                        <span class="material-symbols-outlined text-base">check_circle</span> APROBAR
                    </button>
                    <button onclick="handlePopupAction('reject', ${event.id})" class="flex-1 h-9 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white rounded-lg text-[10px] font-black transition-all flex items-center justify-center gap-1">
                        <span class="material-symbols-outlined text-base">cancel</span> RECHAZAR
                    </button>
                </div>
                ` : ''}

                ${(props.status === 'pendiente' || (isAdmin && props.status === 'aprobada') || (isOwner && props.status === 'aprobada')) ? `
                <button onclick="handlePopupAction('cancel', ${event.id})" class="w-full h-9 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white rounded-lg text-[10px] font-black transition-all flex items-center justify-center gap-1">
                    <span class="material-symbols-outlined text-base">delete_sweep</span> CANCELAR RESERVA
                </button>
                ` : ''}
            </div>
        </div>
    `;

    // Positioning logic
    const rect = info.el.getBoundingClientRect();
    const calendarContainer = document.querySelector('.glass-card.p-4.rounded-xl.flex-1');
    const containerRect = calendarContainer.getBoundingClientRect();
    
    let top = rect.top - containerRect.top;
    let left = rect.left - containerRect.left + rect.width + 10;

    // Check boundaries
    if (left + 320 > containerRect.width) {
        left = rect.left - containerRect.left - 330;
    }
    if (top + 250 > containerRect.height) {
        top = containerRect.height - 260;
    }
    if (window.innerWidth < 768) {
        popup.style.top = '50%';
        popup.style.left = '50%';
        popup.style.transform = 'translate(-50%, -50%)';
        popup.style.position = 'fixed';
    } else {
        popup.style.top = `${Math.max(10, top)}px`;
        popup.style.left = `${Math.max(10, left)}px`;
        popup.style.transform = 'none';
        popup.style.position = 'absolute';
    }

    popup.classList.remove('hidden');
}

window.handlePopupAction = async (action, id) => {
    document.getElementById('reservation-popup').classList.add('hidden');
    if (action === 'approve') await updateReservationStatus(id, 'aprobada');
    else if (action === 'reject') await updateReservationStatus(id, 'rechazada');
    else if (action === 'cancel') await cancelReservation(id);
    
    setTimeout(() => loadCalendar(), 500);
};
