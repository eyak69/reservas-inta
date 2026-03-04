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
    const user = JSON.parse(localStorage.getItem('user'));

    try {
        const res = await apiFetch(`${API_URL}/spaces`);
        if (res && res.ok) {
            setMySpaces(await res.json());
        }
    } catch (e) { }

    const mySpaces = getMySpaces();
    let spacesHtml = mySpaces.map(s => `
        <div class="group relative h-64 sm:h-72 rounded-2xl overflow-hidden cursor-pointer" onclick="openModal(${s.id})">
            <img class="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                 src="${s.image_url || 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iMzAwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMWUyOTNiIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjI0IiBmaWxsPSIjOTRBMzI4IiBkeT0iLjNlbSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+RXNwYWNpbzwvdGV4dD48L3N2Zz4='}"
                 alt="${s.name}" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iMzAwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMWUyOTNiIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjI0IiBmaWxsPSIjOTRBMzI4IiBkeT0iLjNlbSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+RXNwYWNpbzwvdGV4dD48L3N2Zz4='">
            <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent"></div>
            <div class="absolute bottom-0 left-0 right-0 p-5 glass-card border-0 border-t border-white/10 m-3 rounded-xl flex justify-between items-center">
                <div><p class="font-bold text-sm text-white">${s.name}</p></div>
                <div class="flex gap-2">
                    ${user.role === 'admin' ? `
                    <button onclick="event.stopPropagation(); editSpace(${s.id})" class="text-slate-300 hover:text-primary transition-colors z-10 p-1"><span class="material-symbols-outlined text-[20px]">edit</span></button>
                    <button onclick="event.stopPropagation(); deleteSpace(${s.id})" class="text-slate-300 hover:text-red-500 transition-colors z-10 p-1"><span class="material-symbols-outlined text-[20px]">delete</span></button>
                    ` : `<span class="material-symbols-outlined text-primary">verified</span>`}
                </div>
            </div>
        </div>
    `).join('');

    main.innerHTML = `
        <section>
            <h2 class="text-sm font-medium text-slate-400">Hola, ${user.name.split(' ')[0]}</h2>
            <p class="text-2xl font-bold">Explora tus espacios</p>
        </section>
        <section class="flex gap-4">
            <button onclick="openModal()" class="flex-1 bg-gradient-to-r from-primary to-blue-400 p-[1px] rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform">
                <div class="bg-background-dark/20 backdrop-blur-sm rounded-[calc(0.75rem-1px)] py-4 flex items-center justify-center gap-3">
                    <span class="material-symbols-outlined text-white">add_circle</span>
                    <span class="text-white font-bold tracking-wide">Nueva Reserva</span>
                </div>
            </button>
            ${user.role === 'admin' ? `
            <button onclick="openSpaceModal()" class="flex-1 bg-slate-800 p-[1px] rounded-xl shadow-lg hover:scale-[1.02] transition-transform">
                <div class="glass flex items-center justify-center gap-3 py-4 rounded-[calc(0.75rem-1px)]">
                    <span class="material-symbols-outlined text-primary">add_home</span>
                    <span class="text-slate-100 font-bold tracking-wide">Crear Espacio</span>
                </div>
            </button>` : ''}
        </section>
        <section class="space-y-4">
            <h3 class="text-lg font-bold">Espacios Disponibles</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                ${spacesHtml || '<p class="text-slate-500 text-sm">No hay espacios disponibles.</p>'}
            </div>
        </section>
    `;
}

// --- Modal de Reserva (pertenece al Dashboard aunque también es usado desde otras vistas) ---
export async function openModal(preselectedSpaceId = null) {
    let mySpaces = getMySpaces();
    if (mySpaces.length === 0) {
        try {
            const res = await apiFetch(`${API_URL}/spaces`);
            if (res && res.ok) {
                mySpaces = await res.json();
                setMySpaces(mySpaces);
            }
        } catch (e) {

        }
    }

    const modal = document.getElementById('modal-overlay');
    const modalContent = document.getElementById('reservation-modal');
    const select = document.getElementById('form-space');
    select.innerHTML = mySpaces.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    if (preselectedSpaceId) select.value = preselectedSpaceId;

    const d = new Date();
    document.getElementById('form-date').value = d.toISOString().split('T')[0];
    document.getElementById('form-start-time').value = '09:00';
    document.getElementById('form-end-time').value = '10:00';
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
export function openSpaceModal(id = null) {
    setEditingSpaceId(id);
    const mySpaces = getMySpaces();
    if (id) {
        const space = mySpaces.find(s => s.id === id);
        if (!space) return;
        document.getElementById('space-name').value = space.name;
        document.getElementById('space-desc').value = space.description;
        document.getElementById('space-image-url').value = space.image_url || '';
        document.querySelector('#space-modal h2').innerText = 'Editar Espacio';
    } else {
        document.getElementById('space-name').value = '';
        document.getElementById('space-desc').value = '';
        document.getElementById('space-image-url').value = '';
        document.querySelector('#space-modal h2').innerText = 'Nuevo Espacio';
    }
    const modal = document.getElementById('modal-space-overlay');
    const modalContent = document.getElementById('space-modal');
    modal.classList.add('modal-active');
    setTimeout(() => modalContent.classList.add('modal-slide-up'), 10);
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
    setTimeout(() => modal.classList.remove('modal-active'), 300);
}

export async function saveNewSpace() {
    const name = document.getElementById('space-name').value;
    const description = document.getElementById('space-desc').value;
    const image_url = document.getElementById('space-image-url').value;
    if (!name) return showToast('El nombre es requerido.');

    const editingSpaceId = getEditingSpaceId();
    try {
        const url = editingSpaceId ? `${API_URL}/spaces/${editingSpaceId}` : `${API_URL}/spaces`;
        const method = editingSpaceId ? 'PUT' : 'POST';
        const res = await apiFetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description, image_url, is_active: true })
        });
        if (!res) return;
        const data = await res.json();
        if (res.ok) {
            showToast(editingSpaceId ? 'Espacio actualizado.' : 'Espacio creado con éxito.', 'success');
            closeSpaceModal();
            loadDashboard();
        } else showToast(data.message || 'Error al guardar.');
    } catch (e) { showToast('Error de red.'); }
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
