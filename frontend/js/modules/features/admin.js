// ======= MÓDULO ADMIN =======
// Gestión de Usuarios y Auditoría (Logs). Solo accesible para administradores.

import { API_URL } from '../core/api.js';
import { apiFetch } from '../core/api.js';
import { showToast, showConfirm, escapeHTML, showJsonDetails } from '../core/ui.js';
import {
    currentUsersPage, currentUsersLimit, currentUsersSearch, setUsersPage, setUsersLimit, setUsersSearch,
    currentLogsPage, currentLogsLimit, currentLogsFilters, availableLogActions,
    setLogsPage, setLogsLimit, setLogsFilters, setAvailableLogActions
} from '../core/state.js';

// ============ GESTIÓN DE USUARIOS ============

export async function loadUsers(page = 1, search = null) {
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    if (currentUser.role !== 'admin') return;

    setUsersPage(page);
    if (search !== null) setUsersSearch(search);

    const main = document.getElementById('main-content');
    if (!document.getElementById('users-search-input')) {
        main.innerHTML = `<div class="p-8 text-center text-slate-500"><span class="material-symbols-outlined animate-spin text-4xl">sync</span><p class="mt-2 font-medium">Cargando usuarios...</p></div>`;
    }

    try {
        const queryParams = new URLSearchParams({
            page: currentUsersPage, limit: currentUsersLimit, search: currentUsersSearch
        }).toString();
        const res = await apiFetch(`${API_URL}/users?${queryParams}`);
        if (!res) return;
        if (!res.ok) { showToast('Error de permisos al cargar usuarios'); return; }
        const data = await res.json();
        renderUsers(data, main);
    } catch (e) { showToast('Error de red cargando usuarios'); }
}

function renderUsers(data, container) {
    const { users, total, totalPages, page } = data;
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

    const defaultAvatar = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0id2hpdGUiPjxwYXRoIGQ9Ik0xMiAxMmM0LjQxMSAwIDgtMy41ODkgOC04cy0zLjU4OS04LTgtOC04IDMuNTg5LTggOHMzLjU4OSA4IDggOHptMC0xNGM0LjQxMSAwIDggMy41ODkgOCA4czMuNTg5IDggOCA4IDgtMy41ODkgOC04cy0zLjU4OS04LTgtOHptMCAxNGMtNC45NjUgMC0xNC40IDMuNjMyLTE0LjQgMTAuOHYuMWgyOC44di0uMWMwLTcuMjY4LTkuNDM1LTEwLjktMTQuNC0xMC45em0tMTIuMyA5YzEtNC41MiA1LjgyNi02LjkgMTIuMy02LjlzMTEuMyAyLjM4IDEyLjMgNi45aC0yNC42eiIvPjwvc3ZnPg==';

    const usersHtml = users.map(u => `
        <div class="glass-card p-4 rounded-xl shadow-lg border border-white/5 flex flex-col transition-all hover:border-primary/20" data-id="${u.id}">
            <div class="flex items-center gap-4 border-b border-white/5 pb-3 mb-3">
                <div class="size-10 bg-slate-800 rounded-full overflow-hidden border border-slate-700 shrink-0">
                    <img src="${u.avatar_url || defaultAvatar}" alt="Avatar" class="w-full h-full object-cover">
                </div>
                <div class="flex-1 min-w-0">
                    <h3 class="font-bold text-sm text-white truncate">${u.name}</h3>
                    <p class="text-[11px] text-slate-400 truncate font-mono">${u.email}</p>
                </div>
                <div class="shrink-0 flex flex-col items-end gap-1">
                    <span class="text-[9px] tracking-widest uppercase font-black px-2 py-0.5 rounded-md ${u.role === 'admin' ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-slate-800 text-slate-400 border border-slate-700'}">${u.role}</span>
                    <span class="text-[10px] lowercase font-bold ${u.is_active ? 'text-green-400' : 'text-amber-400'} flex items-center gap-1">
                        <span class="size-1.5 rounded-full ${u.is_active ? 'bg-green-400' : 'bg-amber-400'} animate-pulse"></span>
                        ${u.is_active ? 'Activo' : 'Pendiente'}
                    </span>
                </div>
            </div>
            <div class="flex justify-end gap-2 mt-auto">
                ${u.id !== currentUser.id ? `
                    <button onclick="toggleUserStatus(${u.id}, ${u.is_active})" title="${u.is_active ? 'Suspender' : 'Activar'}"
                        class="size-8 flex items-center justify-center rounded-lg border transition-all ${u.is_active ? 'border-red-500/30 text-red-400 hover:bg-red-500/10' : 'border-green-500/30 text-green-400 hover:bg-green-500/10'}">
                        <span class="material-symbols-outlined text-[18px]">${u.is_active ? 'block' : 'check_circle'}</span>
                    </button>
                    <button onclick="changeUserRole(${u.id}, '${u.role}')" title="${u.role === 'admin' ? 'Quitar Admin' : 'Hacer Admin'}"
                        class="size-8 flex items-center justify-center rounded-lg border transition-all ${u.role === 'admin' ? 'border-orange-500/30 text-orange-400 hover:bg-orange-500/10' : 'border-primary/30 text-primary hover:bg-primary/10'}">
                        <span class="material-symbols-outlined text-[18px]">${u.role === 'admin' ? 'person_remove' : 'admin_panel_settings'}</span>
                    </button>
                    <button onclick="generateResetLink(${u.id})" title="Recuperar Clave"
                        class="size-8 flex items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:bg-slate-700/50 hover:text-white transition-all">
                        <span class="material-symbols-outlined text-[18px]">lock_reset</span>
                    </button>
                ` : '<span class="text-xs text-slate-500 italic py-2 pr-2">Tu cuenta</span>'}
            </div>
        </div>
    `).join('');

    const pageOptions = Array.from({ length: totalPages }, (_, i) => i + 1)
        .map(p => `<option value="${p}" ${p === page ? 'selected' : ''}>Pág ${p}</option>`).join('');

    container.innerHTML = `
        <div class="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
            <div>
                <h2 class="text-2xl font-extrabold tracking-tight">Gestión de Usuarios</h2>
                <p class="text-[11px] text-slate-500 mt-0.5 opacity-80 uppercase tracking-wider font-medium">Control de Acceso y Roles</p>
            </div>
            <div class="flex gap-2 w-full md:w-auto items-center">
                <input type="text" id="users-search-input" value="${currentUsersSearch}"
                    onkeyup="if(event.key === 'Enter') loadUsers(1, this.value)"
                    placeholder="Buscar nombre o email..."
                    class="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary placeholder:text-slate-500 h-9 flex-1 md:w-64">
                <button onclick="loadUsers(1, document.getElementById('users-search-input').value)"
                    class="h-9 w-9 flex items-center justify-center bg-primary text-white rounded-lg transition-all active:scale-95 shadow-lg shadow-primary/20">
                    <span class="material-symbols-outlined text-[20px]">search</span>
                </button>
            </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            ${users.length ? usersHtml : '<div class="col-span-full p-12 text-center glass-card rounded-2xl border border-dashed border-slate-700 text-slate-500 italic">No se encontraron usuarios.</div>'}
        </div>
        <div class="flex items-center justify-between px-2 mt-8 text-sm text-slate-400 font-bold border-t border-slate-800 pt-6">
            <div class="flex items-center gap-3">
                <span class="opacity-70">Total: ${total}</span>
                <div class="h-4 w-px bg-slate-700 mx-1"></div>
                <select onchange="changeUsersLimit(this.value)" class="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-slate-300 outline-none focus:border-primary">
                    ${[10, 20, 50, 100].map(v => `<option value="${v}" ${v === currentUsersLimit ? 'selected' : ''}>${v}</option>`).join('')}
                </select>
                <div class="hidden sm:flex h-4 w-px bg-slate-700 mx-1"></div>
                <select onchange="loadUsers(parseInt(this.value))" class="hidden sm:block bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-slate-300 outline-none focus:border-primary">
                    ${pageOptions}
                </select>
            </div>
            <div class="flex gap-2 items-center">
                <span class="text-[10px] opacity-50 mr-2 uppercase tracking-tight">Página ${page} / ${totalPages || 1}</span>
                <button onclick="loadUsers(${page - 1})" ${page <= 1 ? 'disabled' : ''} class="w-8 h-8 bg-slate-800/80 rounded-lg border border-slate-700 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-700 transition flex items-center justify-center">
                    <span class="material-symbols-outlined text-lg block">chevron_left</span>
                </button>
                <button onclick="loadUsers(${page + 1})" ${page >= totalPages ? 'disabled' : ''} class="w-8 h-8 bg-slate-800/80 rounded-lg border border-slate-700 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-700 transition flex items-center justify-center">
                    <span class="material-symbols-outlined text-lg block">chevron_right</span>
                </button>
            </div>
        </div>
    `;
}

export function changeUsersLimit(limit) {
    setUsersLimit(parseInt(limit));
    loadUsers(1);
}

export async function toggleUserStatus(id, currentlyActive) {
    const word = currentlyActive ? 'suspender' : 'activar';
    const ok = await showConfirm(`¿Estás seguro de ${word} este usuario?`);
    if (!ok) return;
    try {
        const res = await apiFetch(`${API_URL}/users/${id}/toggle-status`, { method: 'PUT' });
        if (res.ok) { showToast('Usuario modificado', 'success'); loadUsers(); }
        else { const data = await res.json(); showToast(data.message || 'Error al cambiar estado'); }
    } catch (e) { showToast('Error de red'); }
}

export async function changeUserRole(id, currentRole) {
    const newRoleLabel = currentRole === 'admin' ? 'usuario normal' : 'Administrador';
    const ok = await showConfirm(`¿Querés cambiar el rol de este usuario a "${newRoleLabel}"?`);
    if (!ok) return;
    try {
        const res = await apiFetch(`${API_URL}/users/${id}/change-role`, { method: 'PUT' });
        const data = await res.json();
        if (res.ok) { showToast(data.message || 'Rol actualizado', 'success'); loadUsers(); }
        else showToast(data.message || 'Error al cambiar el rol');
    } catch (e) { showToast('Error de red'); }
}

export async function generateResetLink(id) {

    const ok = await showConfirm('¿Querés generar un link de recuperación? El token anterior quedará invalidado.');
    if (!ok) return;
    try {
        const res = await apiFetch(`${API_URL}/users/${id}/generate-reset-token`, { method: 'POST' });
        const data = await res.json();

        if (res.ok) {
            const resetLink = `${window.location.origin}/#reset?token=${data.token}`;
            const modalContent = `
                <div class="space-y-4 pt-2">
                    <p class="text-xs text-slate-400 uppercase tracking-widest font-bold text-center">Acceso Único</p>
                    <div class="relative group">
                        <input id="reset-link-input" type="text" readonly value="${resetLink}"
                            class="w-full bg-slate-950 border border-slate-700/50 rounded-xl p-4 pr-12 text-[13px] text-primary font-mono outline-none shadow-2xl">
                        <button onclick="copyResetLink()" class="absolute right-2 top-2 p-2 bg-slate-800 hover:bg-primary hover:text-white rounded-lg transition-all text-slate-400 shadow-lg">
                            <span class="material-symbols-outlined text-[20px]">content_copy</span>
                        </button>
                    </div>
                    <div class="bg-primary/5 border border-primary/20 rounded-lg p-3">
                        <p class="text-[11px] text-slate-300 text-center leading-relaxed">Este link es válido por <strong>24 horas</strong> y solo puede usarse <strong>una vez</strong>.</p>
                    </div>
                </div>
            `;

            await showConfirm(modalContent, true, "Link de Recuperación");
        } else showToast(data.message || 'Error al generar el token');
    } catch (e) { showToast('Error de red'); }
}

export function copyResetLink() {
    const input = document.getElementById('reset-link-input');
    if (!input) return;
    input.select();
    navigator.clipboard.writeText(input.value);
    showToast('¡Link copiado al portapapeles!', 'success');
}

// ============ AUDITORÍA / LOGS ============

async function loadLogActionsCache() {
    if (availableLogActions.length > 0) return;
    try {
        const res = await apiFetch(`${API_URL}/logs/actions`);
        if (res && res.ok) setAvailableLogActions(await res.json());
    } catch (e) { }
}

export async function loadLogs(page = 1, applyFilters = false) {
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    if (currentUser.role !== 'admin') return;

    setLogsPage(page);
    const main = document.getElementById('main-content');

    if (applyFilters) {
        setLogsFilters({
            startDate: document.getElementById('log-filter-start')?.value || '',
            endDate: document.getElementById('log-filter-end')?.value || '',
            userSearch: document.getElementById('log-filter-user')?.value || '',
            action: document.getElementById('log-filter-action')?.value || ''
        });
    }

    if (!document.getElementById('log-filters-bar')) {
        main.innerHTML = `<div class="p-8 text-center text-slate-500"><span class="material-symbols-outlined animate-spin text-4xl">sync</span><p class="mt-2 font-medium">Cargando registros de auditoría...</p></div>`;
    }

    await loadLogActionsCache();

    try {
        const queryParams = new URLSearchParams({ page, limit: currentLogsLimit, ...currentLogsFilters }).toString();
        const res = await apiFetch(`${API_URL}/logs?${queryParams}`);
        if (!res) return;
        const data = await res.json();

        const logsTableHtml = data.logs.map(l => {
            const utcString = l.created_at.replace(' ', 'T') + 'Z';
            const dateStr = new Date(utcString).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
            const actionClass = l.action.includes('DELETE') || l.action.includes('CANCEL') || l.action.includes('SUSPEND')
                ? 'bg-red-500/10 text-red-400 border-red-500/30'
                : l.action.includes('CREATE') || l.action.includes('ACTIVATE')
                    ? 'bg-green-500/10 text-green-400 border-green-500/30'
                    : 'bg-slate-800 text-slate-300';

            const detailsJson = JSON.stringify(l.details);

            return `
                <tr class="border-b border-slate-700/50 hover:bg-slate-800/50 transition-colors hidden md:table-row">
                    <td class="p-4 text-xs font-mono text-slate-400 whitespace-nowrap">${dateStr}</td>
                    <td class="p-4">
                        <div class="font-bold text-sm text-slate-200 capitalize">${escapeHTML(l.user_name || 'Desconocido')}</div>
                        <div class="text-[10px] text-slate-500 font-mono">${escapeHTML(l.user_email || 'n/a')}</div>
                    </td>
                    <td class="p-4">
                        <span class="text-[9px] uppercase tracking-widest font-black px-2 py-0.5 rounded border ${actionClass}">${escapeHTML(l.action)}</span>
                        <div class="text-[10px] text-slate-500 mt-1 font-bold">${escapeHTML(l.entity)} ${l.entity_id ? `(#${l.entity_id})` : ''}</div>
                    </td>
                    <td class="p-4">
                        <button onclick='showLogDetails(${detailsJson})' class="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 hover:bg-primary/20 hover:text-primary border border-slate-700 hover:border-primary/50 rounded-lg text-[11px] font-bold transition-all active:scale-95 group">
                            <span class="material-symbols-outlined text-[16px] group-hover:rotate-12 transition-transform">data_object</span>
                            Ver Detalles
                        </button>
                    </td>
                    <td class="p-4 text-xs text-slate-500 text-right font-mono">${escapeHTML(l.ip_address ? l.ip_address.split(':').pop() : '-')}</td>
                </tr>
            `;
        }).join('');

        const logsCardsHtml = data.logs.map(l => {
            const utcString = l.created_at.replace(' ', 'T') + 'Z';
            const dateStr = new Date(utcString).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
            const actionClass = l.action.includes('DELETE') || l.action.includes('CANCEL') || l.action.includes('SUSPEND')
                ? 'bg-red-500/10 text-red-400 border-red-500/30'
                : l.action.includes('CREATE') || l.action.includes('ACTIVATE')
                    ? 'bg-green-500/10 text-green-400 border-green-500/30'
                    : 'bg-slate-800 text-slate-300';

            const detailsJson = JSON.stringify(l.details);

            return `
                <div class="md:hidden glass-card p-4 rounded-xl space-y-3 relative overflow-hidden">
                    <div class="flex justify-between items-start">
                        <div class="text-[10px] font-mono text-slate-400">${dateStr}</div>
                        <span class="text-[8px] uppercase tracking-widest font-black px-2 py-0.5 rounded border ${actionClass}">${escapeHTML(l.action)}</span>
                    </div>
                    <div class="flex items-center gap-3">
                        <div class="size-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500">
                            <span class="material-symbols-outlined text-sm">person</span>
                        </div>
                        <div class="min-w-0">
                            <div class="font-bold text-xs text-slate-200 truncate">${escapeHTML(l.user_name || 'Desconocido')}</div>
                            <div class="text-[9px] text-slate-500 truncate font-mono">${escapeHTML(l.user_email || 'n/a')}</div>
                        </div>
                    </div>
                    <div class="pt-2 flex justify-between items-center border-t border-white/5">
                        <div class="text-[10px] text-slate-500 font-bold">${escapeHTML(l.entity)} ${l.entity_id ? `(#${l.entity_id})` : ''}</div>
                        <button onclick='showLogDetails(${detailsJson})' class="text-primary text-[11px] font-black uppercase tracking-wider hover:underline">Detalles</button>
                    </div>
                    <div class="absolute bottom-2 right-4 text-[9px] text-slate-700 font-mono">IP: ${escapeHTML(l.ip_address ? l.ip_address.split(':').pop() : '-')}</div>
                </div>
            `;
        }).join('');

        const pageOptions = Array.from({ length: data.totalPages }, (_, i) => i + 1)
            .map(p => `<option value="${p}" ${p === data.page ? 'selected' : ''}>Pág ${p}</option>`).join('');

        main.innerHTML = `
            <div class="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
                <div>
                    <h2 class="text-2xl font-extrabold tracking-tight">Auditoría del Sistema</h2>
                    <p class="text-[11px] text-slate-500 mt-0.5 opacity-80 uppercase tracking-wider font-medium">Trazabilidad y Seguridad</p>
                </div>
                <div id="log-filters-bar" class="flex flex-wrap gap-2 w-full md:w-auto items-center">
                    <input type="date" id="log-filter-start" value="${currentLogsFilters.startDate || ''}" title="Fecha desde" class="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary h-9">
                    <input type="date" id="log-filter-end" value="${currentLogsFilters.endDate || ''}" title="Fecha hasta" class="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary h-9">
                    <input type="text" id="log-filter-user" value="${currentLogsFilters.userSearch || ''}" onkeyup="if(event.key === 'Enter') loadLogs(1, true)" placeholder="Usuario / Email..." class="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary placeholder:text-slate-500 h-9 w-40">
                    <select id="log-filter-action" title="Filtrar por tipología" class="bg-slate-800 border border-slate-700 text-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary h-9 cursor-pointer">
                        <option value="">Todas las acciones</option>
                        ${availableLogActions.map(a => `<option value="${a}" ${currentLogsFilters.action === a ? 'selected' : ''}>${a}</option>`).join('')}
                    </select>
                    <button onclick="loadLogs(1, true)" class="h-9 w-9 flex items-center justify-center bg-primary text-white rounded-lg transition-all active:scale-95 shadow-lg shadow-primary/20">
                        <span class="material-symbols-outlined text-[20px]">search</span>
                    </button>
                    <button onclick="loadLogs(currentLogsPage)" class="p-2 bg-slate-800/80 rounded-lg border border-slate-700 hover:bg-slate-700 hover:text-white transition-colors text-slate-400 active:scale-95">
                        <span class="material-symbols-outlined text-[18px] block">refresh</span>
                    </button>
                </div>
            </div>
            <div class="md:glass-card rounded-2xl md:overflow-hidden md:border border-slate-700/50 shadow-2xl">
                <div class="overflow-x-auto hidden md:block">
                    <table class="w-full text-left border-collapse min-w-[800px]">
                        <thead>
                            <tr class="bg-slate-900/60 text-[10px] uppercase font-bold tracking-widest text-slate-500 border-b border-slate-700">
                                <th class="p-4 w-32">Fecha</th><th class="p-4">Usuario</th><th class="p-4">Tipología</th><th class="p-4">Detalles</th><th class="p-4 text-right">IP</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-700/30">
                            ${data.logs.length ? logsTableHtml : '<tr><td colspan="5" class="p-8 text-center text-slate-500 text-sm italic">No se encontraron registros.</td></tr>'}
                        </tbody>
                    </table>
                </div>
                <div class="md:hidden space-y-4">
                    ${data.logs.length ? logsCardsHtml : '<div class="p-8 text-center text-slate-500 text-sm italic">No se encontraron registros.</div>'}
                </div>
            </div>
            <div class="flex items-center justify-between px-2 mt-6 text-sm text-slate-400 font-bold">
                <div class="flex items-center gap-3">
                    <span class="opacity-70">Total: ${data.total}</span>
                    <div class="h-4 w-px bg-slate-700 mx-1"></div>
                    <select onchange="changeLogsLimit(this.value)" class="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-slate-300 outline-none focus:border-primary">
                        ${[10, 20, 30, 40, 50].map(v => `<option value="${v}" ${v === currentLogsLimit ? 'selected' : ''}>${v}</option>`).join('')}
                    </select>
                    <div class="h-4 w-px bg-slate-700 mx-1"></div>
                    <select onchange="loadLogs(parseInt(this.value))" class="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-slate-300 outline-none focus:border-primary">
                        ${pageOptions}
                    </select>
                </div>
                <div class="flex gap-2 items-center">
                    <span class="text-xs opacity-50 mr-2">Página ${data.page} de ${data.totalPages || 1}</span>
                    <button onclick="loadLogs(${data.page - 1})" ${data.page <= 1 ? 'disabled' : ''} class="w-8 h-8 bg-slate-800/80 rounded border border-slate-700 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-700 transition flex items-center justify-center shadow-lg">
                        <span class="material-symbols-outlined text-lg block">chevron_left</span>
                    </button>
                    <button onclick="loadLogs(${data.page + 1})" ${data.page >= data.totalPages ? 'disabled' : ''} class="w-8 h-8 bg-slate-800/80 rounded border border-slate-700 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-700 transition flex items-center justify-center shadow-lg">
                        <span class="material-symbols-outlined text-lg block">chevron_right</span>
                    </button>
                </div>
            </div>
        `;
    } catch (e) { showToast('Error cargando auditoría'); }
}

export function changeLogsLimit(limit) {
    setLogsLimit(parseInt(limit));
    loadLogs(1);
}

window.showLogDetails = (details) => {
    showJsonDetails(details, "Detalles Técnicos del Evento");
};
