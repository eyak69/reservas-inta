// ======= MÓDULO API =======
// Centraliza toda la comunicación con el backend.
// apiFetch inyecta el token automáticamente e intercepta 401/403.

import { API_URL } from './state.js';

export { API_URL };

export async function apiFetch(url, options = {}) {
    const token = localStorage.getItem('token');
    if (token) {
        options.headers = options.headers || {};
        if (!options.headers['Authorization']) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }
    }

    const res = await fetch(url, options);

    if (res.status === 401 || res.status === 403) {
        const data = await res.json().catch(() => ({}));
        if (!url.includes('/login') && !url.includes('/register') && !url.includes('/captcha')) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            // Importación dinámica para evitar dependencia circular
            const { checkAuth } = await import('../features/auth.js');
            checkAuth();
            const { showToast } = await import('./ui.js');
            showToast(data.message || 'Sesión expirada. Por favor iniciá sesión nuevamente.', 'error');
            throw new Error('Unauthorized');
        }
    }
    return res;
}
