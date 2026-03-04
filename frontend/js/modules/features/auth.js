// ======= MÓDULO AUTH =======
// Maneja todo el ciclo de autenticación: login, registro, Google OAuth,
// verificación de sesión, inactividad y recuperación de contraseña.

import { API_URL } from '../core/api.js';
import { apiFetch } from '../core/api.js';
import { showToast, showAlert, showConfirm, togglePasswordVisibility } from '../core/ui.js';
import {
    idleTime, idleInterval, MAX_IDLE_MINUTES,
    resetIdleTime, incrementIdleTime, setIdleInterval,
    getCaptchaToken, setCaptchaToken
} from '../core/state.js';
// NOTA: navigate se llama via window.navigate para evitar dependencia circular con main.js

// --- Inactividad ---
export function startIdleTimer() {
    const resetTimer = () => { resetIdleTime(); };
    window.onload = resetTimer;
    window.onmousemove = resetTimer;
    window.onmousedown = resetTimer;
    window.ontouchstart = resetTimer;
    window.onclick = resetTimer;
    window.onkeydown = resetTimer;

    clearInterval(idleInterval);
    setIdleInterval(setInterval(() => {
        incrementIdleTime();
        if (idleTime >= MAX_IDLE_MINUTES) {
            showToast('Sesión cerrada por inactividad prolongada.', 'error');
            logout(true);
        }
    }, 60000));
}

// --- Auth View Toggle ---
export function toggleAuthView(view) {
    const loginForm = document.getElementById('login-form-container');
    const registerForm = document.getElementById('register-form-container');
    document.querySelectorAll('#auth-view input').forEach(input => input.value = '');
    if (view === 'register') {
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
        loadCaptcha();
    } else {
        registerForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
    }
}

// --- Captcha ---
export async function loadCaptcha() {
    try {
        const res = await fetch(`${API_URL}/auth/captcha`);
        const data = await res.json();
        document.getElementById('captcha-image').innerHTML = data.svg;
        setCaptchaToken(data.captchaToken);
        document.getElementById('reg-captcha').value = '';
    } catch (e) {
        showToast('Error cargando código de seguridad');
    }
}

// --- Pantalla Pendiente ---
export function showPendingScreen(message) {
    const card = document.querySelector('#auth-view .glass-card');
    card.innerHTML = `
        <div class="flex flex-col items-center gap-6 text-center py-4">
            <div class="relative">
                <span class="material-symbols-outlined text-[72px] text-amber-400 animate-pulse">schedule</span>
            </div>
            <div>
                <h2 class="text-2xl font-extrabold tracking-tight text-white">¡Cuenta creada!</h2>
                <p class="text-sm text-slate-400 mt-3 leading-relaxed">${message}</p>
            </div>
            <div class="w-full p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-left">
                <p class="text-xs text-amber-300 font-semibold flex items-center gap-2">
                    <span class="material-symbols-outlined text-[16px]">info</span>
                    Próximo paso
                </p>
                <p class="text-xs text-slate-400 mt-1">Un administrador revisará tu solicitud y habilitará tu cuenta.</p>
            </div>
            <button onclick="location.reload()"
                class="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3 rounded-xl transition-all shadow-lg active:scale-95">
                Volver al inicio
            </button>
        </div>
    `;
}

// --- Login ---
export async function submitLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    if (!email || !password) return showToast('Completa todos los campos');
    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (res.status === 202 && data.pending) {
            showPendingScreen(data.message);
        } else if (res.ok && data.token) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            window.location.reload();
        } else {
            showToast(data.message || 'Error al iniciar sesión');
        }
    } catch (e) { showToast('Error de red'); }
}

// --- Registro ---
export async function submitRegister() {
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-confirm-password').value;
    const captchaText = document.getElementById('reg-captcha').value;
    if (!name || !email || !password || !confirmPassword || !captchaText) return showToast('Completa todos los campos');
    if (password !== confirmPassword) return showToast('Las contraseñas no coinciden', 'error');
    try {
        const res = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password, confirmPassword, captchaText, captchaToken: getCaptchaToken() })
        });
        const data = await res.json();
        if (res.ok) {
            showAlert('¡Registro Exitoso!', data.message || 'Tu cuenta fue creada. Un admin debe habilitarla.', 'success')
                .then(() => toggleAuthView('login'));
        } else {
            showToast(data.message || 'Error al registrarte');
            if (data.message && data.message.includes('seguridad')) loadCaptcha();
        }
    } catch (e) { showToast('Error de red'); }
}

// --- Google Auth ---
export function handleCredentialResponse(response) {
    if (!response || !response.credential) {

        showToast('Error: No se recibió credencial de Google.', 'error');
        return;
    }
    const data = { token: response.credential };
    apiFetch(`${API_URL}/users/login/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
        .then(async res => {
            const body = await res.json().catch(() => ({}));
            if (res.status === 202 && body.pending) {
                showPendingScreen(body.message);
            } else if (res.ok && body.token) {
                localStorage.setItem('token', body.token);
                localStorage.setItem('user', JSON.stringify(body.user));
                window.location.reload();
            } else {
                showToast('Error en login: ' + (body.message || 'Error desconocido'), 'error');
            }
        })
        .catch(err => {

            showToast('Error de conexión con el servidor.', 'error');
        });
}

// --- CheckAuth / Verificación de sesión ---
export async function checkAuth() {
    if (window.location.hash.startsWith('#reset')) {
        handleResetPasswordFlow();
        return;
    }

    const token = localStorage.getItem('token');
    const authView = document.getElementById('auth-view');
    const appView = document.getElementById('app-view');

    if (token) {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        authView.style.display = 'none';
        appView.style.display = 'flex';
        startIdleTimer();

        const defaultAvatar = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0id2hpdGUiPjxwYXRoIGQ9Ik0xMiAxMmM0LjQxMSAwIDgtMy41ODkgOC04cy0zLjU4OS04LTgtOC04IDMuNTg5LTggOHMzLjU4OSA4IDggOHptMC0xNGM0LjQxMSAwIDggMy41ODkgOCA4czMuNTg5IDggOCA4IDgtMy41ODkgOC04cy0zLjU4OS04LTgtOHptMCAxNGMtNC45NjUgMC0xNC40IDMuNjMyLTE0LjQgMTAuOHYuMWgyOC44di0uMWMwLTcuMjY4LTkuNDM1LTEwLjktMTQuNC0xMC45em0tMTIuMyA5YzEtNC41MiA1LjgyNi02LjkgMTIuMy02LjlzMTEuMyAyLjM4IDEyLjMgNi45aC0yNC42eiIvPjwvc3ZnPg==';
        document.getElementById('user-avatar').src = user.avatar_url || defaultAvatar;

        const navUsers = document.getElementById('nav-users');
        const navLogs = document.getElementById('nav-logs');
        if (user.role === 'admin') {
            navUsers.classList.remove('hidden'); navUsers.classList.add('flex');
            navLogs.classList.remove('hidden'); navLogs.classList.add('flex');
        } else {
            navUsers.classList.add('hidden'); navUsers.classList.remove('flex');
            navLogs.classList.add('hidden'); navLogs.classList.remove('flex');
        }

        const lastView = localStorage.getItem('activeView') || 'dashboard';
        window.navigate(lastView);

        document.documentElement.classList.remove('has-session');
        try {
            const res = await apiFetch(`${API_URL}/users/profile`);
            if (!res) return;
            if (!res.ok) {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                localStorage.removeItem('activeView');
                authView.style.display = '';
                appView.style.display = 'none';
                showToast(res.status === 403 ? 'Tu cuenta fue deshabilitada.' : 'Sesión expirada.', 'error');
                return;
            }
            const freshUser = await res.json();
            localStorage.setItem('user', JSON.stringify({
                id: freshUser.id, name: freshUser.name, email: freshUser.email,
                role: freshUser.role, avatar_url: freshUser.avatar_url, hasPassword: freshUser.hasPassword
            }));
            document.getElementById('user-avatar').src = freshUser.avatar_url || defaultAvatar;
            renderSecurityButton(freshUser.hasPassword);
        } catch (e) {

        }
    } else {
        document.documentElement.classList.remove('has-session');
        authView.style.display = '';
        appView.style.display = 'none';
    }
}

// --- Botón de Seguridad ---
export function renderSecurityButton(hasPassword) {
    const header = document.querySelector('header');
    if (!header) return;
    let secBtn = document.getElementById('btn-security');
    if (!secBtn) {
        secBtn = document.createElement('button');
        secBtn.id = 'btn-security';
        secBtn.className = 'size-10 glass rounded-full flex items-center justify-center text-slate-100 ml-auto mr-2';
        secBtn.title = 'Seguridad';
        secBtn.onclick = () => openPasswordManagement();
        const logoutBtn = header.querySelector('button[onclick="logout()"]');
        header.insertBefore(secBtn, logoutBtn);
    }
    secBtn.innerHTML = `<span class="material-symbols-outlined text-[22px] ${hasPassword ? 'text-slate-100' : 'text-amber-400 animate-pulse'}">key</span>`;
}

// --- Gestión de Contraseña (Perfil) ---
export async function openPasswordManagement() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const hasPassword = user.hasPassword;

    const modalHtml = `
        <div class="space-y-4 pt-2">
            <div class="flex flex-col items-center mb-2">
                <div class="bg-primary/10 p-2 rounded-full mb-2">
                    <span class="material-symbols-outlined text-primary text-3xl">shield_person</span>
                </div>
                <h3 class="text-white font-bold text-lg">${user.name}</h3>
                <p class="text-slate-500 text-xs">${user.email}</p>
            </div>
            <p class="text-sm text-slate-400 text-center">
                ${hasPassword ? 'Cambiá tu contraseña actual por una nueva.' : 'Establecé una contraseña local para ingresar sin Google.'}
            </p>
            <div class="space-y-3">
                ${hasPassword ? `
                <div class="space-y-1">
                    <label class="text-[10px] uppercase font-bold text-slate-500 tracking-widest ml-1">Contraseña Actual</label>
                    <div class="relative">
                        <input type="password" id="old-password-input" placeholder="Ingresá tu clave actual"
                            class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 pr-10 text-sm text-white outline-none focus:border-primary">
                        <button type="button" onclick="togglePasswordVisibility('old-password-input','eye-old')" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-primary transition-colors">
                            <span id="eye-old" class="material-symbols-outlined text-[20px]">visibility</span>
                        </button>
                    </div>
                </div>` : ''}
                <div class="space-y-1">
                    <label class="text-[10px] uppercase font-bold text-slate-500 tracking-widest ml-1">Nueva Contraseña</label>
                    <div class="relative">
                        <input type="password" id="new-password-input" placeholder="Mínimo 6 caracteres"
                            class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 pr-10 text-sm text-white outline-none focus:border-primary">
                        <button type="button" onclick="togglePasswordVisibility('new-password-input','eye-new')" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-primary transition-colors">
                            <span id="eye-new" class="material-symbols-outlined text-[20px]">visibility</span>
                        </button>
                    </div>
                </div>
                <div class="space-y-1">
                    <label class="text-[10px] uppercase font-bold text-slate-500 tracking-widest ml-1">Confirmar Nueva Contraseña</label>
                    <div class="relative">
                        <input type="password" id="confirm-password-input" placeholder="Repetí tu nueva clave"
                            class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 pr-10 text-sm text-white outline-none focus:border-primary">
                        <button type="button" onclick="togglePasswordVisibility('confirm-password-input','eye-conf')" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-primary transition-colors">
                            <span id="eye-conf" class="material-symbols-outlined text-[20px]">visibility</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const ok = await showConfirm(modalHtml, true, hasPassword ? "Cambiar Contraseña" : "Establecer Contraseña");
    if (!ok) return;

    const oldPassword = hasPassword ? document.getElementById('old-password-input')?.value : null;
    const newPassword = document.getElementById('new-password-input')?.value;
    const confirmPassword = document.getElementById('confirm-password-input')?.value;

    if (hasPassword && !oldPassword) return showToast('Debes ingresar tu contraseña actual.');
    if (!newPassword || newPassword.length < 6) return showToast('La nueva contraseña debe tener al menos 6 caracteres.');
    if (newPassword !== confirmPassword) return showToast('Las contraseñas no coinciden.');

    try {
        const res = await apiFetch(`${API_URL}/users/profile/password`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldPassword, newPassword })
        });
        if (!res) return;
        const data = await res.json();
        if (res.ok) {
            showToast('¡Contraseña actualizada con éxito!', 'success');
            user.hasPassword = true;
            localStorage.setItem('user', JSON.stringify(user));
            renderSecurityButton(true);
        } else {
            showToast(data.message || 'Error al actualizar contraseña.');
            openPasswordManagement();
        }
    } catch (e) {
        showToast('Falla técnica: ' + e.message);

    }
}

// --- Reseteo de Contraseña por Link ---
export async function handleResetPasswordFlow() {
    const hash = window.location.hash;
    const urlParams = new URLSearchParams(hash.split('?')[1]);
    const token = urlParams.get('token');


    if (!token) {
        showToast('Link de recuperación inválido.', 'error');
        window.location.hash = '';
        checkAuth();
        return;
    }

    try {

        const checkRes = await fetch(`${API_URL}/auth/validate-reset/${token}`);
        if (!checkRes.ok) {
            const errData = await checkRes.json();
            await showAlert('Link Inválido', errData.message || 'El enlace ha expirado.', 'error');
            window.location.hash = '';
            window.history.replaceState(null, null, window.location.pathname);
            checkAuth();
            return;
        }
        const { user } = await checkRes.json();


        const resetHtml = `
            <div class="space-y-4 pt-2">
                <div class="flex flex-col items-center mb-2">
                    <div class="bg-amber-500/10 p-2 rounded-full mb-2">
                        <span class="material-symbols-outlined text-amber-500 text-3xl">lock_reset</span>
                    </div>
                    <h3 class="text-white font-bold text-lg">Recuperar cuenta de ${user.name}</h3>
                    <p class="text-slate-500 text-xs">${user.email}</p>
                </div>
                <p class="text-sm text-slate-400 text-center">Ingresá tu nueva contraseña para recuperar el acceso.</p>
                <div class="space-y-3">
                    <div class="relative">
                        <input type="password" id="new-password" placeholder="Nueva contraseña (min. 6 caracteres)"
                            class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 pr-10 text-sm text-white outline-none focus:border-primary">
                        <button type="button" onclick="togglePasswordVisibility('new-password','eye-reset-new')" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-primary transition-colors">
                            <span id="eye-reset-new" class="material-symbols-outlined text-[20px]">visibility</span>
                        </button>
                    </div>
                    <div class="relative">
                        <input type="password" id="confirm-new-password" placeholder="Confirmar nueva contraseña"
                            class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 pr-10 text-sm text-white outline-none focus:border-primary">
                        <button type="button" onclick="togglePasswordVisibility('confirm-new-password','eye-reset-conf')" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-primary transition-colors">
                            <span id="eye-reset-conf" class="material-symbols-outlined text-[20px]">visibility</span>
                        </button>
                    </div>
                </div>
            </div>
        `;


        const ok = await showConfirm(resetHtml, true, "Nueva Contraseña");


        if (!ok) {
            window.location.hash = '';
            window.history.replaceState(null, null, window.location.pathname);
            checkAuth();
            return;
        }

        const elPass = document.getElementById('new-password');
        const elConf = document.getElementById('confirm-new-password');
        if (!elPass || !elConf) {

            showToast('Falla técnica: No se pudo leer el formulario.');
            return;
        }

        const password = elPass.value;
        const confirm = elConf.value;


        if (!password || password.length < 6) { showToast('La contraseña debe tener al menos 6 caracteres.'); handleResetPasswordFlow(); return; }
        if (password !== confirm) { showToast('Las contraseñas no coinciden.'); handleResetPasswordFlow(); return; }


        const res = await fetch(`${API_URL}/auth/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, password })
        });
        const data = await res.json();


        if (res.ok) {
            window.location.hash = '';
            window.history.replaceState(null, null, window.location.pathname);
            await showAlert('¡Éxito!', data.message || 'Tu contraseña ha sido actualizada.', 'success');
            localStorage.setItem('activeView', 'dashboard');
            checkAuth();
        } else {
            showToast(data.message || 'Error al resetear contraseña', 'error');
            if (data.message?.toLowerCase().includes('expirado') || data.message?.toLowerCase().includes('inválido')) {
                window.location.hash = '';
                window.history.replaceState(null, null, window.location.pathname);
                checkAuth();
            } else {
                handleResetPasswordFlow();
            }
        }
    } catch (e) {

        showToast('Falla técnica: ' + e.message);
    }
}

// --- Logout ---
export function logout(force = false) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    if (force) localStorage.removeItem('activeView');
    window.location.reload();
}
