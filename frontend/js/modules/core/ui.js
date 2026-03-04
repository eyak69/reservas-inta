// ======= MÓDULO UI =======
// Helpers de interfaz de usuario: modales, toasts y utilidades DOM.

import { confirmCleanupTimeout, setConfirmCleanupTimeout } from './state.js';

export function showToast(message, type = 'error') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const bgClass = type === 'success'
        ? 'bg-primary/20 border-primary/50 text-white'
        : 'bg-red-500/20 border-red-500/50 text-white';
    const icon = type === 'success' ? 'check_circle' : 'error';

    toast.className = `glass-card border flex items-center gap-3 p-4 pr-6 rounded-xl shadow-xl backdrop-blur-md toast-enter ${bgClass}`;
    toast.innerHTML = `
        <span class="material-symbols-outlined">${icon}</span>
        <span class="text-sm font-medium">${message}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.replace('toast-enter', 'toast-leave');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

export function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag]));
}

export function showConfirm(message, isHtml = false, title = "¿Estás seguro?") {
    return new Promise((resolve) => {
        const overlay = document.getElementById('confirm-modal-overlay');
        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('confirm-title');
        const msgEl = document.getElementById('confirm-message');
        const btnCancel = document.getElementById('btn-confirm-cancel');
        const btnAccept = document.getElementById('btn-confirm-accept');

        // Cancelar limpieza pendiente de un modal anterior
        if (confirmCleanupTimeout) {
            clearTimeout(confirmCleanupTimeout);
            setConfirmCleanupTimeout(null);
        }

        if (titleEl) titleEl.innerText = title;
        if (isHtml) { msgEl.innerHTML = message; } else { msgEl.innerText = message; }

        overlay.classList.remove('hidden');
        setTimeout(() => modal.classList.add('modal-scale-up'), 10);

        const closeModal = (result) => {
            modal.classList.remove('modal-scale-up');
            resolve(result);
            const t = setTimeout(() => {
                overlay.classList.add('hidden');
                if (isHtml) msgEl.innerHTML = '';
                setConfirmCleanupTimeout(null);
            }, 300);
            setConfirmCleanupTimeout(t);
            btnAccept.onclick = null;
            btnCancel.onclick = null;
        };

        btnAccept.onclick = () => closeModal(true);
        btnCancel.onclick = () => closeModal(false);
    });
}

export function showAlert(title, message, type = 'success') {
    return new Promise((resolve) => {
        const overlay = document.getElementById('alert-modal-overlay');
        const modal = document.getElementById('alert-modal');
        const titleEl = document.getElementById('alert-title');
        const msgEl = document.getElementById('alert-message');
        const iconEl = document.getElementById('alert-icon');
        const iconCont = document.getElementById('alert-icon-container');
        const btnClose = document.getElementById('btn-alert-close');

        titleEl.innerText = title;
        msgEl.innerText = message;

        if (type === 'error') {
            iconEl.innerText = 'error';
            iconCont.classList.replace('bg-primary/20', 'bg-red-500/20');
            iconCont.classList.replace('text-primary', 'text-red-500');
        } else {
            iconEl.innerText = 'check_circle';
            iconCont.classList.add('bg-primary/20', 'text-primary');
            iconCont.classList.remove('bg-red-500/20', 'text-red-500');
        }

        overlay.classList.remove('hidden');
        setTimeout(() => modal.classList.add('modal-scale-up'), 10);

        btnClose.onclick = () => {
            modal.classList.remove('modal-scale-up');
            setTimeout(() => { overlay.classList.add('hidden'); resolve(); }, 300);
            btnClose.onclick = null;
        };
    });
}

export function togglePasswordVisibility(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (!input || !icon) return;
    if (input.type === 'password') {
        input.type = 'text';
        icon.innerText = 'visibility_off';
    } else {
        input.type = 'password';
        icon.innerText = 'visibility';
    }
}
