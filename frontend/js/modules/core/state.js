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
export function getAllReservations() { return allReservations; }
export function setAllReservations(reservations) { allReservations = reservations; }
export function setReservationsPage(p) { currentReservationsPage = p; }
export function setReservationsLimit(l) { currentReservationsLimit = l; }

// Estado de usuarios (paginación)
export let currentUsersPage = 1;
export let currentUsersLimit = 10;
export let currentUsersSearch = '';
export function setUsersPage(p) { currentUsersPage = p; }
export function setUsersLimit(l) { currentUsersLimit = l; }
export function setUsersSearch(s) { currentUsersSearch = s; }

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
