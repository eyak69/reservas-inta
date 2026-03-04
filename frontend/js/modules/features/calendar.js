// ======= MÓDULO CALENDARIO =======
// Integración con FullCalendar para visualizar reservas.

import { API_URL } from '../core/api.js';
import { showToast } from '../core/ui.js';

export async function loadCalendar() {
    const main = document.getElementById('main-content');
    const token = localStorage.getItem('token');

    main.innerHTML = `
        <section class="h-full flex flex-col">
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-xl font-bold">Calendario de Ocupación</h2>
                <button onclick="openModal()" class="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-xl font-bold transition-colors shadow-lg shadow-primary/30">
                    <span class="material-symbols-outlined text-sm">add_circle</span>
                    Nueva Reserva
                </button>
            </div>
            <div class="glass-card p-4 rounded-xl flex-1 min-h-[500px] overflow-hidden">
                <div id="calendar" class="h-full pt-2"></div>
            </div>
        </section>
    `;

    try {
        const res = await fetch(`${API_URL}/reservations/calendar`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const eventsData = await res.json();

        const events = eventsData.map(r => ({
            id: r.id,
            title: `${r.space_name} (${r.user_name.split(' ')[0]})`,
            start: r.start_time,
            end: r.end_time,
            color: r.status === 'aprobada' ? '#2b6cee' : '#f97316',
            extendedProps: { status: r.status, description: r.description }
        }));

        const isMobile = window.innerWidth < 768;
        const calendarEl = document.getElementById('calendar');
        const calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: isMobile ? 'timeGridDay' : 'timeGridWeek',
            locale: 'es',
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
                const statusStr = info.event.extendedProps.status === 'aprobada' ? 'Aprobada' : 'Pendiente';
                showToast(`Reserva ${statusStr}: ${info.event.title}`, 'success');
            }
        });
        calendar.render();
    } catch (e) {
        console.error(e);
        showToast('Error cargando el calendario', 'error');
    }
}
