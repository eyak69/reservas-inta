// ======= MAIN.JS — PUNTO DE ENTRADA =======
// Este archivo orquesta todos los módulos e inicializa la aplicación.
// Las funciones se exponen en window.* para compatibilidad con los onclick del HTML.

import { checkAuth, logout, toggleAuthView, submitLogin, submitRegister, openPasswordManagement, loadCaptcha } from './features/auth.js';
import { togglePasswordVisibility } from './core/ui.js';
import { loadDashboard, openModal, closeModal, toggleAllDay, openSpaceModal, editSpace, deleteSpace, closeSpaceModal, saveNewSpace, submitReservation } from './features/dashboard.js';
import { loadReservations, renderReservations, updateReservationStatus, cancelReservation, changeReservationsLimit } from './features/reservations.js';
import { loadCalendar } from './features/calendar.js';
import { loadUsers, changeUsersLimit, toggleUserStatus, changeUserRole, generateResetLink, copyResetLink, loadLogs, changeLogsLimit } from './features/admin.js';
import { initChat, destroyChat, toggleChat, handleChatKey, sendChatMessage } from './features/chat.js';

// ======= ENRUTADOR SPA =======
export function navigate(view) {
    localStorage.setItem('activeView', view);
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('text-primary');
        el.classList.add('text-slate-400');
        if (el.dataset.target === view) {
            el.classList.add('text-primary');
            el.classList.remove('text-slate-400');
        }
    });
    if (view === 'dashboard') loadDashboard();
    else if (view === 'reservations') loadReservations();
    else if (view === 'calendar') loadCalendar();
    else if (view === 'users') loadUsers();
    else if (view === 'logs') loadLogs();
}

// ======= EXPOSICIÓN GLOBAL (para compatibilidad con onclick en HTML) =======
// Esto es necesario porque los atributos onclick no tienen acceso al scope de ES Modules.
window.checkAuth = checkAuth;
window.logout = logout;
window.navigate = navigate;
window.toggleAuthView = toggleAuthView;
window.submitLogin = submitLogin;
window.submitRegister = submitRegister;
window.openPasswordManagement = openPasswordManagement;
window.togglePasswordVisibility = togglePasswordVisibility;

window.loadDashboard = loadDashboard;
window.openModal = openModal;
window.closeModal = closeModal;
window.toggleAllDay = toggleAllDay;
window.openSpaceModal = openSpaceModal;
window.editSpace = editSpace;
window.deleteSpace = deleteSpace;
window.closeSpaceModal = closeSpaceModal;
window.saveNewSpace = saveNewSpace;
window.submitReservation = submitReservation;

window.loadReservations = loadReservations;
window.renderReservations = renderReservations;
window.updateReservationStatus = updateReservationStatus;
window.cancelReservation = cancelReservation;
window.changeReservationsLimit = changeReservationsLimit;

window.loadCalendar = loadCalendar;

window.loadUsers = loadUsers;
window.changeUsersLimit = changeUsersLimit;
window.toggleUserStatus = toggleUserStatus;
window.changeUserRole = changeUserRole;
window.generateResetLink = generateResetLink;
window.copyResetLink = copyResetLink;
window.loadLogs = loadLogs;
window.changeLogsLimit = changeLogsLimit;

window.initChat = initChat;
window.destroyChat = destroyChat;
window.toggleChat = toggleChat;
window.handleChatKey = handleChatKey;
window.sendChatMessage = sendChatMessage;

// ======= INICIALIZACIÓN =======
window.addEventListener('DOMContentLoaded', () => {
    // Listeners de auth — evita race condition en producción con onclick en HTML
    document.getElementById('btn-login-submit')?.addEventListener('click', submitLogin);
    document.getElementById('btn-register-submit')?.addEventListener('click', submitRegister);
    document.getElementById('btn-reload-captcha')?.addEventListener('click', loadCaptcha);
    document.getElementById('link-go-register')?.addEventListener('click', (e) => { e.preventDefault(); toggleAuthView('register'); });
    document.getElementById('link-go-login')?.addEventListener('click', () => toggleAuthView('login'));

    checkAuth();
});
