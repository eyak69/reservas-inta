// ======= MÓDULO UI =======
// Helpers de interfaz de usuario: modales, toasts y utilidades DOM.

import { confirmCleanupTimeout, setConfirmCleanupTimeout } from './state.js';

export function showToast(message, type = 'error') {
    let container = document.getElementById('toast-container');
    
    // Blindaje: Si no existe el contenedor, lo creamos dinámicamente
    if (!container) {
        if (!document.body) return;
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const bgClass = type === 'success'
        ? 'bg-primary/20 border-primary/50 text-white'
        : 'bg-red-500/20 border-red-500/50 text-white';
    const icon = type === 'success' ? 'check_circle' : 'error';

    toast.className = `glass-card border flex items-center gap-3 p-4 pr-6 rounded-xl shadow-xl backdrop-blur-md toast-enter ${bgClass} pointer-events-auto`;
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

export function showAlert(title, message, type = 'success', isHtml = false) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('alert-modal-overlay');
        const modal = document.getElementById('alert-modal');
        const titleEl = document.getElementById('alert-title');
        const msgEl = document.getElementById('alert-message');
        const iconEl = document.getElementById('alert-icon');
        const iconCont = document.getElementById('alert-icon-container');
        const btnClose = document.getElementById('btn-alert-close');

        titleEl.innerText = title;
        if (isHtml) msgEl.innerHTML = message; else msgEl.innerText = message;

        if (type === 'error') {
            iconEl.innerText = 'error';
            iconCont.classList.replace('bg-primary/20', 'bg-red-500/20');
            iconCont.classList.replace('text-primary', 'text-red-500');
        } else if (type === 'info') {
            iconEl.innerText = 'info';
            iconCont.classList.add('bg-primary/20', 'text-primary');
            iconCont.classList.remove('bg-red-500/20', 'text-red-500');
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
export function formatJson(json) {
    if (typeof json !== 'string') json = JSON.stringify(json, null, 2);
    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
        let cls = 'json-number';
        if (/^"/.test(match)) {
            if (/:$/.test(match)) {
                cls = 'json-key';
            } else {
                cls = 'json-string';
            }
        } else if (/true|false/.test(match)) {
            cls = 'json-boolean';
        } else if (/null/.test(match)) {
            cls = 'json-null';
        }
        return `<span class="${cls}">${match}</span>`;
    });
}

export async function showJsonDetails(data, title = "Detalles del Evento") {
    const formatted = formatJson(data);
    const modalContent = `
        <div class="space-y-4 pt-2 w-full">
            <div class="json-viewer shadow-2xl custom-scrollbar max-h-[50vh] text-left">
                <pre class="whitespace-pre"><code>${formatted}</code></pre>
            </div>
            <button onclick='copyJsonToClipboard(${JSON.stringify(JSON.stringify(data))})' class="w-full bg-slate-800/50 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-xl transition-all border border-slate-700/50 flex items-center justify-center gap-2 active:scale-95 group">
                <span class="material-symbols-outlined text-[20px] group-hover:scale-110 transition-transform">content_copy</span>
                <span>Copiar JSON</span>
            </button>
        </div>
    `;

    return await showAlert(title, modalContent, 'info', true);
}

window.copyJsonToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
        showToast("JSON copiado al portapapeles", "success");
    });
};
