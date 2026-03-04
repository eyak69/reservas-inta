import { API_URL, apiFetch } from '../core/api.js';
import { showToast, showConfirm, escapeHTML } from '../core/ui.js';
import {
    getAllReservations, setAllReservations,
    currentReservationsPage, currentReservationsLimit, currentReservationsFilters,
    setReservationsPage, setReservationsLimit, setReservationsFilters
} from '../core/state.js';

export async function loadReservations(page = 1) {
    setReservationsPage(page);
    const main = document.getElementById('main-content');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const isAdmin = user && user.role === 'admin';

    // Obtener filtros del DOM si existen, o usar los del estado
    const elDate = document.getElementById('filter-date');
    const elStatus = document.getElementById('filter-status');
    const elUser = document.getElementById('filter-user');

    const filterDate = elDate ? elDate.value : currentReservationsFilters.date;
    const filterStatus = elStatus ? elStatus.value : currentReservationsFilters.status;
    const filterSearch = elUser ? elUser.value : currentReservationsFilters.search;

    // Sincronizar con el estado
    setReservationsFilters({ date: filterDate, status: filterStatus, search: filterSearch });

    if (!document.getElementById('reservations-filters-bar')) {
        main.innerHTML = `<div class="p-8 text-center text-slate-500"><span class="material-symbols-outlined animate-spin text-4xl">sync</span><p class="mt-2 font-medium">Cargando gestión de reservas...</p></div>`;
    }

    try {
        const queryParams = new URLSearchParams({
            page: currentReservationsPage,
            limit: currentReservationsLimit,
            ...currentReservationsFilters
        }).toString();

        const url = isAdmin ? `${API_URL}/reservations?${queryParams}` : `${API_URL}/reservations/my-reservations?${queryParams}`;
        const res = await apiFetch(url);
        if (res && res.ok) {
            const data = await res.json();
            renderReservations(data, main, isAdmin);
        }
    } catch (e) {
        showToast('Error de red cargando reservas');
    }
}

export function renderReservations(data, container, isAdmin) {
    // Si data es un array (API vieja) lo convertimos al nuevo formato
    const reservations = Array.isArray(data) ? data : (data.reservations || []);
    const total = data.total !== undefined ? data.total : reservations.length;
    const totalPages = data.totalPages || 1;
    const page = data.page || 1;

    const filtersHtml = `
        <div class="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
            <div>
                <h2 class="text-2xl font-extrabold tracking-tight">${isAdmin ? 'Gestión de Reservas' : 'Mis Reservas'}</h2>
                <p class="text-[11px] text-slate-500 mt-0.5 opacity-80 uppercase tracking-wider font-medium">${isAdmin ? 'Administración Global' : 'Historial Personal'}</p>
            </div>
            <div id="reservations-filters-bar" class="flex flex-wrap gap-2 w-full md:w-auto items-center">
                <input type="date" id="filter-date" value="${currentReservationsFilters.date}" onchange="loadReservations(1)" class="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary h-9">
                <select id="filter-status" onchange="loadReservations(1)" class="bg-slate-800 border border-slate-700 text-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary h-9 cursor-pointer">
                    <option value="" ${currentReservationsFilters.status === '' ? 'selected' : ''}>Todos los estados</option>
                    <option value="pendiente" ${currentReservationsFilters.status === 'pendiente' ? 'selected' : ''}>Pendientes</option>
                    <option value="aprobada" ${currentReservationsFilters.status === 'aprobada' ? 'selected' : ''}>Aprobadas</option>
                    <option value="rechazada" ${currentReservationsFilters.status === 'rechazada' ? 'selected' : ''}>Rechazadas</option>
                    <option value="cancelada" ${currentReservationsFilters.status === 'cancelada' ? 'selected' : ''}>Canceladas</option>
                </select>
                ${isAdmin ? `
                <div class="flex gap-2">
                    <input type="text" id="filter-user" value="${currentReservationsFilters.search}" onkeyup="if(event.key === 'Enter') loadReservations(1)" placeholder="Buscar usuario o sala..." 
                        class="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary placeholder:text-slate-500 h-9 md:w-48">
                    <button onclick="loadReservations(1)" class="h-9 w-9 flex items-center justify-center bg-primary text-white rounded-lg transition-all active:scale-95 shadow-lg shadow-primary/20">
                        <span class="material-symbols-outlined text-[20px]">search</span>
                    </button>
                </div>
                ` : ''}
                <button onclick="loadReservations(currentReservationsPage)" class="p-2 bg-slate-800/80 rounded-lg border border-slate-700 hover:bg-slate-700 hover:text-white transition-colors text-slate-400">
                    <span class="material-symbols-outlined text-[18px] block">refresh</span>
                </button>
            </div>
        </div>
    `;

    const reservationsListHtml = reservations.map(r => {
        const date = new Date(r.start_time).toLocaleString('es-ES', { dateStyle: 'short' });
        const startTime = new Date(r.start_time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        const endTime = new Date(r.end_time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

        const statusClasses = {
            'pendiente': 'bg-orange-500/10 text-orange-400 border-orange-500/30',
            'aprobada': 'bg-primary/10 text-primary border-primary/30',
            'rechazada': 'bg-red-500/10 text-red-400 border-red-500/30',
            'cancelada': 'bg-slate-500/10 text-slate-400 border-slate-500/30'
        };

        return `
            <div class="glass-card p-5 rounded-2xl border border-white/5 transition-all hover:border-primary/20 hover:translate-x-1 group">
                <div class="flex flex-col sm:flex-row justify-between gap-4">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-1">
                            <h3 class="font-bold text-lg text-white truncate">${escapeHTML(r.space_name)}</h3>
                            <span class="text-[9px] uppercase tracking-widest font-black px-2 py-0.5 rounded-md border ${statusClasses[r.status] || 'bg-slate-800'}">${r.status}</span>
                        </div>
                        ${isAdmin ? `
                        <div class="flex items-center gap-2 text-xs text-slate-400 mb-2 font-medium">
                            <span class="material-symbols-outlined text-[14px]">person</span>
                            <span class="truncate">${escapeHTML(r.user_name)}</span>
                            <span class="opacity-30">•</span>
                            <span class="truncate font-mono">${escapeHTML(r.user_email)}</span>
                        </div>
                        ` : ''}
                        <div class="flex items-center gap-4 text-sm">
                            <div class="flex items-center gap-1.5 text-slate-300 font-bold bg-slate-900/50 px-2 py-1 rounded-lg">
                                <span class="material-symbols-outlined text-[16px] text-primary">calendar_today</span>
                                ${date}
                            </div>
                            <div class="flex items-center gap-1.5 text-slate-300 font-bold bg-slate-900/50 px-2 py-1 rounded-lg">
                                <span class="material-symbols-outlined text-[16px] text-primary">schedule</span>
                                ${startTime} - ${endTime}
                            </div>
                        </div>
                        ${r.comments ? `
                        <div class="mt-3 p-3 bg-slate-900/40 rounded-xl border border-white/5 text-xs text-slate-500 italic">
                            "${escapeHTML(r.comments)}"
                        </div>
                        ` : ''}
                    </div>
                    
                    <div class="flex flex-col sm:flex-row justify-end gap-2 shrink-0 border-t sm:border-t-0 sm:border-l border-white/5 pt-4 sm:pt-0 sm:pl-4 mt-4 sm:mt-0">
                        ${isAdmin && r.status === 'pendiente' ? `
                        <button onclick="updateReservationStatus(${r.id}, 'aprobada')" 
                            class="w-full sm:w-auto h-10 px-4 bg-primary/20 hover:bg-primary text-primary hover:text-white rounded-xl text-xs font-black transition-all active:scale-95 flex items-center justify-center gap-2">
                            <span class="material-symbols-outlined text-[18px]">check_circle</span>
                            APROBAR
                        </button>
                        <button onclick="updateReservationStatus(${r.id}, 'rechazada')" 
                            class="w-full sm:w-auto h-10 px-4 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white rounded-xl text-xs font-black transition-all active:scale-95 flex items-center justify-center gap-2">
                            <span class="material-symbols-outlined text-[18px]">cancel</span>
                            RECHAZAR
                        </button>
                        ` : ''}
                        
                        ${(r.status === 'pendiente' || (isAdmin && r.status === 'aprobada')) ? `
                        <button onclick="cancelReservation(${r.id})" 
                            class="w-full sm:w-auto h-10 px-4 border border-red-500/30 text-red-500/80 hover:bg-red-500 hover:text-white rounded-xl text-xs font-black transition-all active:scale-95 flex items-center justify-center gap-2">
                            <span class="material-symbols-outlined text-[18px]">delete_sweep</span>
                            CANCELAR
                        </button>
                        ` : ''}
                        
                        ${!isAdmin && r.status === 'aprobada' ? `
                        <div class="text-[10px] text-green-500 font-bold flex items-center gap-1 py-2 px-3 bg-green-500/10 rounded-lg border border-green-500/20 uppercase tracking-tighter">
                            <span class="material-symbols-outlined text-[16px]">verified</span>
                            RESERVA CONFIRMADA
                        </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    const pageOptions = Array.from({ length: totalPages }, (_, i) => i + 1)
        .map(p => `<option value="${p}" ${p === page ? 'selected' : ''}>Pág ${p}</option>`).join('');

    const paginationHtml = `
        <div class="flex items-center justify-between px-2 mt-8 text-sm text-slate-400 font-bold border-t border-slate-800 pt-6">
            <div class="flex items-center gap-3">
                <span class="opacity-70">Total: ${total}</span>
                <div class="h-4 w-px bg-slate-700 mx-1"></div>
                <select onchange="changeReservationsLimit(this.value)" class="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-slate-300 outline-none focus:border-primary">
                    ${[5, 10, 20, 50].map(v => `<option value="${v}" ${v === currentReservationsLimit ? 'selected' : ''}>${v}</option>`).join('')}
                </select>
                <div class="hidden sm:flex h-4 w-px bg-slate-700 mx-1"></div>
                <select onchange="loadReservations(parseInt(this.value))" class="hidden sm:block bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-slate-300 outline-none focus:border-primary">
                    ${pageOptions || '<option value="1">Pág 1</option>'}
                </select>
            </div>
            <div class="flex gap-2 items-center">
                <span class="text-[10px] opacity-50 mr-2 uppercase tracking-tight">Página ${page} / ${totalPages || 1}</span>
                <button onclick="loadReservations(${page - 1})" ${page <= 1 ? 'disabled' : ''} 
                    class="w-8 h-8 bg-slate-800/80 rounded-lg border border-slate-700 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-700 transition flex items-center justify-center">
                    <span class="material-symbols-outlined text-lg block">chevron_left</span>
                </button>
                <button onclick="loadReservations(${page + 1})" ${page >= totalPages ? 'disabled' : ''} 
                    class="w-8 h-8 bg-slate-800/80 rounded-lg border border-slate-700 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-700 transition flex items-center justify-center">
                    <span class="material-symbols-outlined text-lg block">chevron_right</span>
                </button>
            </div>
        </div>
    `;

    container.innerHTML = `
        <div class="max-w-6xl mx-auto">
            ${filtersHtml}
            <div id="reservations-list" class="grid grid-cols-1 gap-4">
                ${reservations.length ? reservationsListHtml : '<div class="p-16 text-center glass-card rounded-3xl border border-dashed border-slate-700 text-slate-500 italic">No se encontraron reservas con estos filtros.</div>'}
            </div>
            ${total > 0 ? paginationHtml : ''}
        </div>
    `;

    // Mantener los valores de los filtros después de renderizar (opcional si ya están en el DOM)
    // Pero como re-generamos el main.innerHTML, necesitamos asegurarnos de que el usuario vea lo que escribió.
    const fDate = document.getElementById('filter-date');
    const fStatus = document.getElementById('filter-status');
    const fSearch = document.getElementById('filter-user');
}

export function changeReservationsLimit(limit) {
    setReservationsLimit(parseInt(limit));
    loadReservations(1);
}

export async function updateReservationStatus(id, newStatus) {
    const word = newStatus === 'aprobada' ? 'APROBAR' : 'RECHAZAR';
    const isConfirmed = await showConfirm(`¿Estás seguro de que deseas ${word} esta reserva?`);
    if (!isConfirmed) return;
    try {
        const res = await apiFetch(`${API_URL}/reservations/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        if (res && res.ok) {
            showToast('Reserva actualizada', 'success');
            loadReservations(currentReservationsPage);
        } else {
            const data = await res.json().catch(() => ({}));
            showToast(data.message || 'Error al actualizar la reserva');
        }
    } catch (e) { showToast('Error de red'); }
}

export async function cancelReservation(id) {
    const isConfirmed = await showConfirm('¿Seguro que deseas CANCELAR esta reserva? Esta acción no se puede deshacer.');
    if (!isConfirmed) return;
    try {
        const res = await apiFetch(`${API_URL}/reservations/${id}`, {
            method: 'DELETE'
        });
        if (res && res.ok) {
            showToast('Reserva cancelada exitosamente', 'success');
            loadReservations(currentReservationsPage);
        } else {
            const data = await res.json().catch(() => ({}));
            showToast(data.message || 'Error al cancelar');
        }
    } catch (e) { showToast('Error de red'); }
}
