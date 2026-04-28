// ======= MÓDULO DASHBOARD =======
// Carga la pantalla principal con la grilla de espacios disponibles.

import { API_URL } from '../core/api.js';
import { apiFetch } from '../core/api.js';
import { showToast, showConfirm } from '../core/ui.js';
import { escapeHTML } from '../core/ui.js';
import { getMySpaces, setMySpaces, getEditingSpaceId, setEditingSpaceId } from '../core/state.js';
import { loadCalendar } from './calendar.js';
import { loadReservations } from './reservations.js';

export async function loadDashboard() {
    const main = document.getElementById('main-content');
    let user = JSON.parse(localStorage.getItem('user'));

    // Actualizar perfil para obtener estado de Telegram
    try {
        const profileRes = await apiFetch(`${API_URL}/users/profile`);
        if (profileRes && profileRes.ok) {
            const userData = await profileRes.json();
            localStorage.setItem('user', JSON.stringify(userData));
            user = userData;
        }
    } catch (e) { console.error('Error actualizando perfil:', e); }

    try {
        const res = await apiFetch(`${API_URL}/spaces`);
        if (res && res.ok) {
            setMySpaces(await res.json());
        }
    } catch (e) { }

    const mySpaces = getMySpaces();
    
    // Tarjetas de Espacios con Estética Premium
    let spacesHtml = mySpaces.map(s => `
        <div class="group relative h-72 rounded-3xl overflow-hidden cursor-pointer shadow-2xl transition-all duration-500 hover:shadow-emerald-500/10" onclick="openModal(${s.id})">
            <img class="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
                 src="${s.image_url || 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=600'}"
                 alt="${s.name}" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iMzAwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMWUyOTNiIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjI0IiBmaWxsPSIjOTRBMzI4IiBkeT0iLjNlbSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+RXNwYWNpbzwvdGV4dD48L3N2Zz4='">
            <div class="absolute inset-0 bg-gradient-to-t from-obsidian-navy via-obsidian-navy/20 to-transparent"></div>
            
            <div class="absolute bottom-0 left-0 right-0 p-3 m-2 md:p-4 md:m-3 rounded-2xl glass-card flex justify-between items-center gap-2 transform transition-transform duration-500 group-hover:translate-y-[-4px] overflow-hidden">
                <div class="flex flex-col min-w-0">
                    <p class="font-bold text-sm md:text-base text-white tracking-tight truncate">${escapeHTML(s.name)}</p>
                    <p class="text-[9px] md:text-[10px] text-emerald-400 font-bold uppercase tracking-widest mt-0.5 truncate">Espacio Verificado</p>
                </div>
                <div class="flex gap-1 shrink-0">
                    ${user.role === 'admin' ? `
                    <button onclick="event.stopPropagation(); editSpace(${s.id})" class="size-7 md:size-8 rounded-full bg-white/5 flex items-center justify-center text-slate-300 hover:bg-emerald-500 hover:text-white transition-all"><span class="material-symbols-outlined text-[16px] md:text-[18px]">edit</span></button>
                    <button onclick="event.stopPropagation(); deleteSpace(${s.id})" class="size-7 md:size-8 rounded-full bg-white/5 flex items-center justify-center text-slate-300 hover:bg-red-500 hover:text-white transition-all"><span class="material-symbols-outlined text-[16px] md:text-[18px]">delete</span></button>
                    ` : `<div class="size-7 md:size-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500 shadow-inner"><span class="material-symbols-outlined text-[16px] md:text-[18px]">verified</span></div>`}
                </div>
            </div>
        </div>
    `).join('');

    main.innerHTML = `
        <!-- Welcome Header -->
        <header class="flex items-center justify-between">
            <div class="space-y-1">
                <p class="text-2xl md:text-3xl font-black text-white tracking-tight">Bienvenido, ${user.name.split(' ')[0]}</p>
            </div>
            ${user.telegram_linked ? `
                <div class="flex items-center gap-2 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
                    <span class="material-symbols-outlined text-emerald-500 text-sm">smart_toy</span>
                    <span class="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Bot Activo</span>
                </div>
            ` : ''}
        </header>

        <!-- Telegram Connection Banner (Solo si NO está vinculado) -->
        ${!user.telegram_linked ? `
        <section class="mt-6">
            <div class="glass-card p-4 flex flex-col md:flex-row items-center justify-between gap-4 relative overflow-hidden group border-white/5">
                <div class="flex items-center gap-4 relative z-10">
                    <div class="size-10 rounded-xl bg-slate-800/50 flex items-center justify-center text-emerald-500 shadow-inner">
                        <span class="material-symbols-outlined text-[20px]">smart_toy</span>
                    </div>
                    <div>
                        <h3 class="text-sm font-bold text-white tracking-tight">Asistente de Telegram</h3>
                        <p class="text-[11px] text-slate-400">Gestioná reservas por voz o texto.</p>
                    </div>
                </div>
                
                <div class="flex items-center gap-4 relative z-10 w-full md:w-auto justify-between md:justify-end">
                    <div class="bg-obsidian-navy/40 px-3 py-1.5 rounded-xl border border-white/5 flex items-center gap-3">
                        <span class="text-[9px] uppercase font-bold text-emerald-500/70 tracking-widest">Código</span>
                        <span class="text-sm font-mono font-black text-white tracking-widest" id="tg-link-code">${user.link_token || '---'}</span>
                    </div>
                    <button onclick="window.open('https://t.me/intareservas_bot', '_blank')" class="px-5 py-2 rounded-xl bg-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-[0.15em] hover:bg-emerald-500 hover:text-white transition-all shadow-lg border border-emerald-500/30">
                        Conectar
                    </button>
                </div>
            </div>
            <div class="mt-2 text-center">
                <button onclick="generateNewTelegramCode()" class="text-[9px] text-slate-600 font-bold uppercase hover:text-emerald-500 transition-colors tracking-widest">Generar Nuevo Código</button>
            </div>
        </section>
        ` : ''}

        <!-- Main Actions -->
        <section class="${user.role === 'admin' ? 'grid grid-cols-1 sm:grid-cols-2' : 'flex'} gap-4 mt-8">
            <button onclick="openModal()" class="flex-1 btn-jewel py-5 rounded-2xl flex items-center justify-center gap-3 shadow-2xl">
                <span class="material-symbols-outlined text-[24px]">add_circle</span>
                <span class="text-base font-black tracking-wide uppercase">Nueva Reserva</span>
            </button>
            ${user.role === 'admin' ? `
            <button onclick="openSpaceModal()" class="flex-1 glass-card flex items-center justify-center gap-3 py-5 hover:bg-white/5 transition-all border border-white/5">
                <span class="material-symbols-outlined text-emerald-500">add_home</span>
                <span class="text-slate-100 font-bold tracking-wide uppercase text-sm">Crear Espacio</span>
            </button>` : ''}
        </section>

        <!-- Spaces Grid -->
        <section class="space-y-6 mt-10">
            <div class="flex items-center justify-between px-2">
                <h3 class="text-lg font-black text-white tracking-tight uppercase">Espacios Disponibles</h3>
                <span class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">${mySpaces.length} Salas listas</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                ${spacesHtml || '<p class="text-slate-500 text-sm italic p-10 glass-card text-center w-full">No hay espacios disponibles para reserva en este momento.</p>'}
            </div>
        </section>
        
        <div class="h-10"></div> <!-- Spacer -->
    `;
}

// Lógica de Telegram
export async function generateNewTelegramCode() {
    const codeSpan = document.getElementById('tg-link-code');
    if (codeSpan) codeSpan.innerText = '...';
    
    try {
        const res = await apiFetch(`${API_URL}/users/profile/telegram-token`, { method: 'POST' });
        if (res && res.ok) {
            const data = await res.json();
            if (codeSpan) codeSpan.innerText = data.token;
            showToast('Nuevo código generado', 'success');
        } else {
            showToast('Error generando código');
            if (codeSpan) codeSpan.innerText = 'ERROR';
        }
    } catch (e) {
        showToast('Error de conexión');
    }
}

export async function requestUnlinkTelegram() {
    const user = JSON.parse(localStorage.getItem('user'));
    const isConfirmed = await showConfirm(`
        <div class="text-center space-y-4">
            <p class="text-slate-300">¿Estás seguro de que querés desvincular tu cuenta de Telegram?</p>
            <p class="text-xs text-slate-500 italic">Perderás el acceso al asistente IA desde la app de mensajería.</p>
        </div>
    `);
    
    if (!isConfirmed) return;

    try {
        const res = await apiFetch(`${API_URL}/users/${user.id}/external-identity/telegram`, { method: 'DELETE' });
        if (res && res.ok) {
            showToast('Telegram desvinculado', 'success');
            loadDashboard();
        } else {
            const data = await res.json();
            showToast(data.message || 'Error al desvincular');
        }
    } catch (e) {
        showToast('Error de conexión');
    }
}

// --- Modal de Reserva (pertenece al Dashboard aunque también es usado desde otras vistas) ---
export async function openModal(preselectedSpaceId = null, start = null, end = null) {
    let mySpaces = getMySpaces();
    if (mySpaces.length === 0) {
        try {
            const res = await apiFetch(`${API_URL}/spaces`);
            if (res && res.ok) {
                mySpaces = await res.json();
                setMySpaces(mySpaces);
            }
        } catch (e) { }
    }

    const modal = document.getElementById('modal-overlay');
    const modalContent = document.getElementById('reservation-modal');
    const select = document.getElementById('form-space');
    select.innerHTML = mySpaces.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    if (preselectedSpaceId) select.value = preselectedSpaceId;

    const d = start ? new Date(start) : new Date();
    const dEnd = end ? new Date(end) : null;

    // Usar componentes locales para evitar desfase de zona horaria (Regla 8)
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    document.getElementById('form-date').value = `${year}-${month}-${day}`;
    
    // Formatear HH:mm
    const formatTime = (date) => {
        const h = String(date.getHours()).padStart(2, '0');
        const m = String(date.getMinutes()).padStart(2, '0');
        return `${h}:${m}`;
    };

    document.getElementById('form-start-time').value = start ? formatTime(d) : '09:00';
    document.getElementById('form-end-time').value = dEnd ? formatTime(dEnd) : (start ? formatTime(new Date(d.getTime() + 60 * 60 * 1000)) : '10:00');
    
    document.getElementById('form-comments').value = '';
    const allDayCheckbox = document.getElementById('form-all-day');
    if (allDayCheckbox) {
        allDayCheckbox.checked = false;
        document.getElementById('time-inputs-container').classList.remove('opacity-30', 'pointer-events-none');
    }

    modal.classList.add('modal-active');
    setTimeout(() => modalContent.classList.add('modal-slide-up'), 10);
}

export function closeModal() {
    const modal = document.getElementById('modal-overlay');
    const modalContent = document.getElementById('reservation-modal');
    modalContent.classList.remove('modal-slide-up');
    setTimeout(() => modal.classList.remove('modal-active'), 300);
}

export function toggleAllDay() {
    const isChecked = document.getElementById('form-all-day').checked;
    const timeContainer = document.getElementById('time-inputs-container');
    if (isChecked) {
        timeContainer.classList.add('opacity-30', 'pointer-events-none');
        document.getElementById('form-start-time').value = '00:00';
        document.getElementById('form-end-time').value = '23:59';
    } else {
        timeContainer.classList.remove('opacity-30', 'pointer-events-none');
        document.getElementById('form-start-time').value = '09:00';
        document.getElementById('form-end-time').value = '10:00';
    }
}

// --- Gestión de Espacios (Admin) ---
// --- Gestión de Espacios (Admin) ---
export function openSpaceModal(id = null) {
    setEditingSpaceId(id);
    const mySpaces = getMySpaces();
    
    // Resetear UI de imagen
    const preview = document.getElementById('space-image-preview');
    const emptyState = document.getElementById('image-empty-state');
    const changeOverlay = document.getElementById('image-change-overlay');
    const fileInput = document.getElementById('space-image-file');
    const urlInput = document.getElementById('space-image-url');
    const urlContainer = document.getElementById('url-input-container');

    if (preview) { preview.src = ''; preview.classList.add('hidden'); }
    if (emptyState) emptyState.classList.remove('hidden');
    if (changeOverlay) changeOverlay.classList.add('hidden');
    if (fileInput) fileInput.value = '';
    if (urlInput) urlInput.value = '';
    if (urlContainer) urlContainer.classList.add('translate-y-full');

    if (id) {
        const space = mySpaces.find(s => s.id === id);
        if (!space) return;
        document.getElementById('space-name').value = space.name || '';
        document.getElementById('space-desc').value = space.description || '';
        document.getElementById('space-image-url').value = space.image_url || '';
        document.querySelector('#space-modal h2').innerText = 'Editar Espacio';
        
        // Si hay imagen (ya sea URL externa o interna de uploads), mostrarla
        if (space.image_url && space.image_url.trim() !== '') {
            if (preview) {
                preview.src = space.image_url;
                preview.classList.remove('hidden');
            }
            if (emptyState) emptyState.classList.add('hidden');
            if (changeOverlay) changeOverlay.classList.remove('hidden');
        } else {
            if (preview) preview.classList.add('hidden');
            if (emptyState) emptyState.classList.remove('hidden');
            if (changeOverlay) changeOverlay.classList.add('hidden');
        }
    } else {
        document.getElementById('space-name').value = '';
        document.getElementById('space-desc').value = '';
        document.getElementById('space-image-url').value = '';
        document.querySelector('#space-modal h2').innerText = 'Nuevo Espacio';
        if (preview) preview.classList.add('hidden');
        if (emptyState) emptyState.classList.remove('hidden');
        if (changeOverlay) changeOverlay.classList.add('hidden');
    }

    const modal = document.getElementById('modal-space-overlay');
    const modalContent = document.getElementById('space-modal');
    modal.classList.add('modal-active');
    modal.classList.remove('hidden');
    setTimeout(() => modalContent.classList.add('modal-slide-up'), 10);
}

export function previewSpaceImage(input) {
    const preview = document.getElementById('space-image-preview');
    const emptyState = document.getElementById('image-empty-state');
    const changeOverlay = document.getElementById('image-change-overlay');
    
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            preview.src = e.target.result;
            preview.classList.remove('hidden');
            emptyState.classList.add('hidden');
            changeOverlay.classList.remove('hidden');
        }
        reader.readAsDataURL(input.files[0]);
    }
}

export function clearSpaceImage() {
    const preview = document.getElementById('space-image-preview');
    const emptyState = document.getElementById('image-empty-state');
    const changeOverlay = document.getElementById('image-change-overlay');
    const fileInput = document.getElementById('space-image-file');
    const urlInput = document.getElementById('space-image-url');

    if (preview) { preview.src = ''; preview.classList.add('hidden'); }
    if (emptyState) emptyState.classList.remove('hidden');
    if (changeOverlay) changeOverlay.classList.add('hidden');
    if (fileInput) fileInput.value = '';
    if (urlInput) urlInput.value = '';
}

export function toggleImageUrlInput() {
    const container = document.getElementById('url-input-container');
    const input = document.getElementById('space-image-url');
    const isHidden = container.classList.contains('translate-y-full');
    
    if (isHidden) {
        container.classList.remove('translate-y-full');
        input.focus();
        input.select();
    } else {
        container.classList.add('translate-y-full');
        // Al cerrar, si hay algo en el input, previsualizarlo
        const url = input.value;
        if (url) {
            const preview = document.getElementById('space-image-preview');
            const emptyState = document.getElementById('image-empty-state');
            const changeOverlay = document.getElementById('image-change-overlay');
            preview.src = url;
            preview.classList.remove('hidden');
            if (emptyState) emptyState.classList.add('hidden');
            if (changeOverlay) changeOverlay.classList.remove('hidden');
        }
    }
}

export function editSpace(id) { openSpaceModal(id); }

export async function deleteSpace(id) {
    const isConfirmed = await showConfirm('¿Estás seguro de desactivar/eliminar este espacio?');
    if (!isConfirmed) return;
    try {
        const res = await apiFetch(`${API_URL}/spaces/${id}`, { method: 'DELETE' });
        if (!res) return;
        if (res.ok) { showToast('Espacio eliminado', 'success'); loadDashboard(); }
        else showToast('Error al borrar espacio.');
    } catch (e) { showToast('Error de red.'); }
}

export function closeSpaceModal() {
    const modal = document.getElementById('modal-space-overlay');
    const modalContent = document.getElementById('space-modal');
    modalContent.classList.remove('modal-slide-up');
    setTimeout(() => {
        modal.classList.remove('modal-active');
        modal.classList.add('hidden');
    }, 300);
}

export async function saveNewSpace() {
    const name = document.getElementById('space-name').value;
    const description = document.getElementById('space-desc').value;
    const image_url = document.getElementById('space-image-url').value;
    const fileInput = document.getElementById('space-image-file');
    const id = getEditingSpaceId();

    if (!name) return showToast('El nombre es obligatorio');

    // Usar FormData para soportar carga de archivos
    const formData = new FormData();
    formData.append('name', name);
    formData.append('description', description);
    formData.append('image_url', image_url);
    if (fileInput.files[0]) {
        formData.append('image', fileInput.files[0]);
    }
    formData.append('is_active', true);

    try {
        const url = id ? `${API_URL}/spaces/${id}` : `${API_URL}/spaces`;
        const method = id ? 'PUT' : 'POST';
        
        const res = await fetch(url, {
            method,
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            body: formData
        });

        if (res.ok) {
            showToast(id ? 'Espacio actualizado.' : 'Espacio creado con éxito.', 'success');
            closeSpaceModal();
            loadDashboard();
        } else {
            const data = await res.json().catch(() => ({ message: 'Error desconocido del servidor' }));
            showToast(data.message || 'Error al guardar.');
        }
    } catch (e) {
        console.error('[Dashboard] Error al guardar espacio:', e);
        showToast('Error de conexión o de procesamiento.');
    }
}

// --- Envío de Reserva ---
export async function submitReservation() {
    const spaceId = document.getElementById('form-space').value;
    const date = document.getElementById('form-date').value;
    const start = document.getElementById('form-start-time').value;
    const end = document.getElementById('form-end-time').value;
    const comments = document.getElementById('form-comments').value;

    if (!spaceId || !date || !start || !end) { showToast("Por favor completa los campos requeridos.", 'error'); return; }

    const start_time = `${date}T${start}:00`;
    const end_time = `${date}T${end}:00`;

    if (new Date(start_time) >= new Date(end_time)) { showToast("La hora de fin debe ser posterior a la de inicio.", 'error'); return; }

    const spaceInput = document.getElementById('form-space');
    const spaceName = spaceInput.options[spaceInput.selectedIndex]?.text || 'Espacio';
    const uiDateParts = date.split('-');
    const uiDateString = `${uiDateParts[2]}/${uiDateParts[1]}/${uiDateParts[0]}`;
    const isAllDay = document.getElementById('form-all-day').checked;

    const resumeHtml = `
        <div class="w-full bg-slate-900 border border-slate-700/80 rounded-xl p-5 mb-2 mt-2 space-y-3">
            <div class="flex flex-col gap-2">
                <div class="flex items-start gap-3"><span class="material-symbols-outlined text-primary text-xl mt-0.5">meeting_room</span><p class="text-slate-200 text-base font-medium">Espacio: ${escapeHTML(spaceName)}</p></div>
                <div class="flex items-start gap-3"><span class="material-symbols-outlined text-primary text-xl mt-0.5">calendar_today</span><p class="text-slate-200 text-base">Fecha: ${escapeHTML(uiDateString)}</p></div>
                <div class="flex items-start gap-3"><span class="material-symbols-outlined text-primary text-xl mt-0.5">schedule</span><p class="text-slate-200 text-base">Horario: ${isAllDay ? 'Todo el día' : `${escapeHTML(start)} a ${escapeHTML(end)}`}</p></div>
            </div>
            ${comments ? `<div class="pt-3 border-t border-slate-700/50"><p class="text-slate-400 italic text-sm">"${escapeHTML(comments)}"</p></div>` : ''}
        </div>
        <p class="text-slate-400 text-sm mt-4 text-center uppercase tracking-widest font-medium">Resumen de solicitud</p>
    `;

    const isConfirmed = await showConfirm(resumeHtml, true);
    if (!isConfirmed) return;

    const btn = document.getElementById('btn-submit');
    btn.innerText = "Enviando...";
    btn.disabled = true;

    try {
        const res = await apiFetch(`${API_URL}/reservations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ space_id: spaceId, start_time, end_time, comments })
        });
        if (!res) return;
        const data = await res.json();
        if (res.ok) {
            showToast('¡Reserva creada con éxito!', 'success');
            closeModal();
            const activeTab = document.querySelector('.nav-item.text-primary')?.dataset.target;
            if (activeTab === 'dashboard') loadDashboard();
            else if (activeTab === 'calendar') loadCalendar();
            else loadReservations();
        } else showToast(data.message || 'Error al crear la reserva');
    } catch (e) {
        showToast('Error de conexión.');
    } finally {
        btn.innerHTML = `<span>Confirmar Reserva</span>`;
        btn.disabled = false;
    }
}
