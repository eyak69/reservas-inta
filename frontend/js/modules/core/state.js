// ======= ESTADO GLOBAL DE LA APLICACIÓN =======
// Este módulo centraliza las variables de estado compartidas entre módulos.
// Usar las funciones setX/getX para modificar el estado desde otros módulos.

export const API_URL = '/api';

// Estado de espacios
let mySpaces = [];
export function getMySpaces() { return mySpaces; }
export function setMySpaces(spaces) { mySpaces = spaces; }

// Estado de reservas
let allReservations = [];
export let currentReservationsPage = 1;
export let currentReservationsLimit = 10;
export let currentReservationsFilters = { date: '', status: '', search: '' };
export function getAllReservations() { return allReservations; }
export function setAllReservations(reservations) { allReservations = reservations; }
export function setReservationsPage(p) { currentReservationsPage = p; }
export function setReservationsLimit(l) { currentReservationsLimit = l; }
export function setReservationsFilters(f) { currentReservationsFilters = { ...currentReservationsFilters, ...f }; }

// Estado de usuarios (paginación + filtros)
export let currentUsersPage = 1;
export let currentUsersLimit = 10;
export let currentUsersSearch = '';
export let currentUsersFilters = { status: '', role: '', telegram: '' };

export function setUsersPage(p) { currentUsersPage = p; }
export function setUsersLimit(l) { currentUsersLimit = l; }
export function setUsersSearch(s) { currentUsersSearch = s; }
export function setUsersFilters(f) { currentUsersFilters = { ...currentUsersFilters, ...f }; }

// Estado de logs (paginación + filtros)
export let currentLogsPage = 1;
export let currentLogsLimit = 10;
export let currentLogsFilters = {};
export let availableLogActions = [];
export function setLogsPage(p) { currentLogsPage = p; }
export function setLogsLimit(l) { currentLogsLimit = l; }
export function setLogsFilters(f) { currentLogsFilters = f; }
export function setAvailableLogActions(a) { availableLogActions = a; }

// Estado de edición de espacio (Admin)
let editingSpaceId = null;
export function getEditingSpaceId() { return editingSpaceId; }
export function setEditingSpaceId(id) { editingSpaceId = id; }

// Captcha
let currentCaptchaToken = '';
export function getCaptchaToken() { return currentCaptchaToken; }
export function setCaptchaToken(t) { currentCaptchaToken = t; }

// Inactividad
export let idleTime = 0;
export const MAX_IDLE_MINUTES = 30;
export let idleInterval = null;
export function resetIdleTime() { idleTime = 0; }
export function incrementIdleTime() { idleTime++; }
export function setIdleInterval(i) { idleInterval = i; }

// Control de modales encadenados
export let confirmCleanupTimeout = null;
export function setConfirmCleanupTimeout(t) { confirmCleanupTimeout = t; }

// Usuario (Helpers de persistencia)
export function getCurrentUser() {
    const userStr = localStorage.getItem('user');
    try {
        return userStr ? JSON.parse(userStr) : null;
    } catch (e) {
        return null;
    }
}
// Forzar exportación explícita (Regla 1)
export { getCurrentUser as getUser };
