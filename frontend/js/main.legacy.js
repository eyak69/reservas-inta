const API_URL = '/api';
let mySpaces = [];
let spaceCardsData = []; // Guardar info para filtrar y ver detalles
let currentCaptchaToken = '';

// --- Sistema de Inactividad y Helper API ---
let idleTime = 0;
const MAX_IDLE_MINUTES = 30; // Elegido por el usuario
let idleInterval;
let confirmCleanupTimeout = null; // Para evitar que modales encadenados se cierren solos

function startIdleTimer() {
    // Resetear contador ante interacción
    const resetTimer = () => { idleTime = 0; };
    window.onload = resetTimer;
    window.onmousemove = resetTimer;
    window.onmousedown = resetTimer;
    window.ontouchstart = resetTimer;
    window.onclick = resetTimer;
    window.onkeydown = resetTimer;

    // Verificar cada minuto si nos pasamos de la media hora
    clearInterval(idleInterval);
    idleInterval = setInterval(() => {
        idleTime++;
        if (idleTime >= MAX_IDLE_MINUTES) {
            showToast('Sesión cerrada por inactividad prolongada.', 'error');
            logout(true);
        }
    }, 60000); // 1 minuto
}

// ======= FETCH CON INTERCEPCIÓN AUTOMÁTICA DE 401/403 =======
async function apiFetch(url, options = {}) {
    // Inyección automática del Token
    const token = localStorage.getItem('token');
    if (token) {
        options.headers = options.headers || {};
        if (!options.headers['Authorization']) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }
    }

    const res = await fetch(url, options);
    if (res.status === 401 || res.status === 403) {
        // Token inválido, expirado o usuario eliminado/deshabilitado
        const data = await res.json().catch(() => ({}));
        // Solo cerrar sesión si no es la ruta de login
        if (!url.includes('/login') && !url.includes('/register') && !url.includes('/captcha')) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            checkAuth();
            showToast(data.message || 'Sesión expirada. Por favor iniciá sesión nuevamente.', 'error');
            throw new Error('Unauthorized');
        }
    }
    return res;
}
// =============================================================

// ======= CUSTOM UI HELPERS =======
function showToast(message, type = 'error') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const bgClass = type === 'success' ? 'bg-primary/20 border-primary/50 text-white' : 'bg-red-500/20 border-red-500/50 text-white';
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

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g,
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag])
    );
}

function showConfirm(message, isHtml = false, title = "¿Estás seguro?") {
    return new Promise((resolve) => {
        const overlay = document.getElementById('confirm-modal-overlay');
        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('confirm-title');
        const msgEl = document.getElementById('confirm-message');
        const btnCancel = document.getElementById('btn-confirm-cancel');
        const btnAccept = document.getElementById('btn-confirm-accept');

        // SI HAY UNA LIMPIEZA PENDIENTE (de un modal anterior), LA CANCELAMOS
        if (confirmCleanupTimeout) {
            clearTimeout(confirmCleanupTimeout);
            confirmCleanupTimeout = null;
        }

        if (titleEl) titleEl.innerText = title;

        if (isHtml) {
            msgEl.innerHTML = message;
        } else {
            msgEl.innerText = message;
        }

        overlay.classList.remove('hidden');

        // Timeout para que la transición CSS funcione al quitar hidden
        setTimeout(() => modal.classList.add('modal-scale-up'), 10);

        const closeModal = (result) => {
            modal.classList.remove('modal-scale-up');

            // Resolvemos de inmediato para que el llamador pueda leer el DOM si hay campos inyectados
            resolve(result);

            // Programamos el ocultamiento real con margen para la animación
            confirmCleanupTimeout = setTimeout(() => {
                overlay.classList.add('hidden');
                if (isHtml) msgEl.innerHTML = ''; // Limpiar HTML inyectado
                confirmCleanupTimeout = null;
            }, 300);

            btnAccept.onclick = null;
            btnCancel.onclick = null;
        };

        btnAccept.onclick = () => closeModal(true);
        btnCancel.onclick = () => closeModal(false);
    });
}

function showAlert(title, message, type = 'success') {
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
            setTimeout(() => {
                overlay.classList.add('hidden');
                resolve();
            }, 300);
            btnClose.onclick = null;
        };
    });
}
// =================================

// Autenticación Nativa y Captcha

function toggleAuthView(view) {
    const loginForm = document.getElementById('login-form-container');
    const registerForm = document.getElementById('register-form-container');

    // Limpiar campos comunes
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

function togglePasswordVisibility(inputId, iconId) {
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

async function loadCaptcha() {
    try {
        const res = await fetch(`${API_URL}/auth/captcha`);
        const data = await res.json();
        document.getElementById('captcha-image').innerHTML = data.svg;
        currentCaptchaToken = data.captchaToken;
        document.getElementById('reg-captcha').value = ''; // Limpiar campo
    } catch (e) {
        showToast('Error cargando código de seguridad');
    }
}

// Muestra pantalla de espera de aprobación dentro del auth-view
function showPendingScreen(message) {
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
                <p class="text-xs text-slate-400 mt-1">Un administrador revisará tu solicitud y habilitará tu cuenta. Intentá ingresar más tarde.</p>
            </div>
            <button onclick="location.reload()"
                class="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3 rounded-xl transition-all shadow-lg active:scale-95">
                Volver al inicio
            </button>
        </div>
    `;
}

async function submitLogin() {
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
            enterApp(data.user); // Login directo, sin re-verificar ni mostrar loader
        } else {
            showToast(data.message || 'Error al iniciar sesión');
        }
    } catch (e) { showToast('Error de red'); }
}

async function submitRegister() {
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
            body: JSON.stringify({ name, email, password, confirmPassword, captchaText, captchaToken: currentCaptchaToken })
        });
        const data = await res.json();

        if (res.ok) {
            showAlert('¡Registro Exitoso!', data.message || 'Tu cuenta ha sido creada correctamente. Por seguridad, un administrador debe habilitarla antes de que puedas iniciar sesión. Te avisaremos pronto.', 'success').then(() => {
                toggleAuthView('login');
            });
        } else {
            showToast(data.message || 'Error al registrarte');
            if (data.message && data.message.includes('seguridad')) loadCaptcha();
        }
    } catch (e) { showToast('Error de red'); }
}

// Manejo del Login de Google
function handleCredentialResponse(response) {
    const data = { token: response.credential };

    fetch(`${API_URL}/users/login/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
        .then(res => res.json().then(body => ({ status: res.status, body })))
        .then(({ status, body }) => {
            if (status === 202 && body.pending) {
                showPendingScreen(body.message);
            } else if (body.token) {
                localStorage.setItem('token', body.token);
                localStorage.setItem('user', JSON.stringify(body.user));
                enterApp(body.user); // Login directo, sin re-verificar ni mostrar loader
            } else {
                showToast('Error en login: ' + (body.message || 'Error desconocido'), 'error');
            }
        })
        .catch(err => {
            
            showToast('Error de conexión con Google.', 'error');
        });
}

// Entra a la app directamente tras login
function enterApp(user) {
    window.location.reload();
}

// Verificación de estado de sesión
async function checkAuth() {
    // Detectar flujo de recupero de contraseña antes de cualquier otra cosa
    if (window.location.hash.startsWith('#reset')) {
        handleResetPasswordFlow();
        return;
    }

    const token = localStorage.getItem('token');
    const authView = document.getElementById('auth-view');
    const appView = document.getElementById('app-view');

    if (token) {
        // Mostrar app inmediatamente (el CSS ya ocultó el auth-view via has-session)
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        authView.style.display = 'none';
        appView.style.display = 'flex';

        // Iniciar detector de inactividad
        startIdleTimer();

        document.getElementById('user-avatar').src = user.avatar_url || 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0id2hpdGUiPjxwYXRoIGQ9Ik0xMiAxMmM0LjQxMSAwIDgtMy41ODkgOC04cy0zLjU4OS04LTgtOC04IDMuNTg5LTggOHMzLjU4OSA4IDggOHptMC0xNGM0LjQxMSAwIDggMy41ODkgOCA4czMuNTg5IDggOCA4IDgtMy41ODkgOC04cy0zLjU4OS04LTgtOHptMCAxNGMtNC45NjUgMC0xNC40IDMuNjMyLTE0LjQgMTAuOHYuMWgyOC44di0uMWMwLTcuMjY4LTkuNDM1LTEwLjktMTQuNC0xMC45em0tMTIuMyA5YzEtNC41MiA1LjgyNi02LjkgMTIuMy02LjlzMTEuMyAyLjM4IDEyLjMgNi45aC0yNC42eiIvPjwvc3ZnPg==';

        const navUsers = document.getElementById('nav-users');
        const navLogs = document.getElementById('nav-logs');
        if (user.role === 'admin') {
            navUsers.classList.remove('hidden');
            navUsers.classList.add('flex');
            navLogs.classList.remove('hidden');
            navLogs.classList.add('flex');
        } else {
            navUsers.classList.add('hidden');
            navUsers.classList.remove('flex');
            navLogs.classList.add('hidden');
            navLogs.classList.remove('flex');
        }

        // Restaurar la última vista activa
        const lastView = localStorage.getItem('activeView') || 'dashboard';
        navigate(lastView);

        // Verificar con el backend en segundo plano (no bloquea la UI)
        document.documentElement.classList.remove('has-session');
        try {
            const res = await apiFetch(`${API_URL}/users/profile`);
            if (!res) return; // Fuimos deslogueados por 401

            if (!res.ok) {
                // Token inválido o usuario eliminado/deshabilitado → logout silencioso
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                localStorage.removeItem('activeView');
                authView.style.display = '';
                appView.style.display = 'none';
                if (res.status === 403) {
                    showToast('Tu cuenta fue deshabilitada.', 'error');
                } else {
                    showToast('Sesión expirada. Iniciá sesión nuevamente.', 'error');
                }
                return;
            }
            // Actualizar datos frescos del usuario en localStorage
            const freshUser = await res.json();
            localStorage.setItem('user', JSON.stringify({
                id: freshUser.id,
                name: freshUser.name,
                email: freshUser.email,
                role: freshUser.role,
                avatar_url: freshUser.avatar_url,
                hasPassword: freshUser.hasPassword
            }));

            // Actualizar avatar y mostrar botón de seguridad si es necesario
            const defaultAvatar = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0id2hpdGUiPjxwYXRoIGQ9Ik0xMiAxMmM0LjQxMSAwIDgtMy41ODkgOC04cy0zLjU4OS04LTgtOC04IDMuNTg5LTggOHMzLjU4OSA4IDggOHptMC0xNGM0LjQxMSAwIDggMy41ODkgOCA4czMuNTg5IDggOCA4IDgtMy41ODkgOC04cy0zLjU4OS04LTgtOHptMCAxNGMtNC45NjUgMC0xNC40IDMuNjMyLTE0LjQgMTAuOHYuMWgyOC44di0uMWMwLTcuMjY4LTkuNDM1LTEwLjktMTQuNC0xMC45em0tMTIuMyA5YzEtNC41MiA1LjgyNi02LjkgMTIuMy02LjlzMTEuMyAyLjM4IDEyLjMgNi45aC0yNC42eiIvPjwvc3ZnPg==';
            document.getElementById('user-avatar').src = freshUser.avatar_url || defaultAvatar;
            renderSecurityButton(freshUser.hasPassword);

        } catch (e) {
            // Error de red — dejar pasar, el usuario sigue navegando
            
        }
    } else {
        // Sin token → mostrar login
        document.documentElement.classList.remove('has-session');
        authView.style.display = '';
        appView.style.display = 'none';
    }
}

function renderSecurityButton(hasPassword) {
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

async function openPasswordManagement() {
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
                ${hasPassword
            ? 'Cambiá tu contraseña actual por una nueva para mantener tu cuenta segura.'
            : 'Tu cuenta de Google no tiene una contraseña local establecida. Establecé una para poder ingresar sin Google si lo deseás.'}
            </p>
            <div class="space-y-3">
                ${hasPassword ? `
                <div class="space-y-1">
                    <label class="text-[10px] uppercase font-bold text-slate-500 tracking-widest ml-1">Contraseña Actual</label>
                    <div class="relative">
                        <input type="password" id="old-password-input" placeholder="Ingresá tu clave actual" 
                            class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 pr-10 text-sm text-white outline-none focus:border-primary">
                        <button type="button" onclick="togglePasswordVisibility('old-password-input', 'eye-old')" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-primary transition-colors">
                            <span id="eye-old" class="material-symbols-outlined text-[20px]">visibility</span>
                        </button>
                    </div>
                </div>
                ` : ''}
                <div class="space-y-1">
                    <label class="text-[10px] uppercase font-bold text-slate-500 tracking-widest ml-1">Nueva Contraseña</label>
                    <div class="relative">
                        <input type="password" id="new-password-input" placeholder="Mínimo 6 caracteres" 
                            class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 pr-10 text-sm text-white outline-none focus:border-primary">
                        <button type="button" onclick="togglePasswordVisibility('new-password-input', 'eye-new')" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-primary transition-colors">
                            <span id="eye-new" class="material-symbols-outlined text-[20px]">visibility</span>
                        </button>
                    </div>
                </div>
                <div class="space-y-1">
                    <label class="text-[10px] uppercase font-bold text-slate-500 tracking-widest ml-1">Confirmar Nueva Contraseña</label>
                    <div class="relative">
                        <input type="password" id="confirm-password-input" placeholder="Repetí tu nueva clave" 
                            class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 pr-10 text-sm text-white outline-none focus:border-primary">
                        <button type="button" onclick="togglePasswordVisibility('confirm-password-input', 'eye-conf')" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-primary transition-colors">
                            <span id="eye-conf" class="material-symbols-outlined text-[20px]">visibility</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const ok = await showConfirm(modalHtml, true, hasPassword ? "Cambiar Contraseña" : "Establecer Contraseña");
    if (!ok) return;

    const oldPassword = hasPassword ? document.getElementById('old-password-input').value : null;
    const newPassword = document.getElementById('new-password-input').value;
    const confirmPassword = document.getElementById('confirm-password-input').value;

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
            // Actualizar hasPassword localmente
            user.hasPassword = true;
            localStorage.setItem('user', JSON.stringify(user));
            renderSecurityButton(true);
        } else {
            showToast(data.message || 'Error al actualizar contraseña.');
            openPasswordManagement(); // Reabrir si hubo error
        }
    } catch (e) {
        showToast('Falla técnica: ' + e.message);
        
    }
}

// ======= FLUJO DE RECUPERACIÓN DE CONTRASEÑA =======
async function handleResetPasswordFlow() {
    const hash = window.location.hash;
    const urlParams = new URLSearchParams(hash.split('?')[1]);
    const token = urlParams.get('token');

    

    if (!token) {
        showToast('Link de recuperación inválido.', 'error');
        window.location.hash = '';
        checkAuth();
        return;
    }

    // 1. Validar el token y obtener info del usuario antes de mostrar el modal
    try {
        
        const checkRes = await fetch(`${API_URL}/auth/validate-reset/${token}`);
        if (!checkRes.ok) {
            
            const errData = await checkRes.json();
            await showAlert('Link Inválido', errData.message || 'El enlace de recuperación ha expirado o es incorrecto.', 'error');
            window.location.hash = '';
            window.history.replaceState(null, null, window.location.pathname);
            checkAuth();
            return;
        }
        const { user } = await checkRes.json();
        

        // 2. Mostrar modal premium para nueva contraseña con info del usuario
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
                        <button type="button" onclick="togglePasswordVisibility('new-password', 'eye-reset-new')" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-primary transition-colors">
                            <span id="eye-reset-new" class="material-symbols-outlined text-[20px]">visibility</span>
                        </button>
                    </div>
                    <div class="relative">
                        <input type="password" id="confirm-new-password" placeholder="Confirmar nueva contraseña" 
                            class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 pr-10 text-sm text-white outline-none focus:border-primary">
                        <button type="button" onclick="togglePasswordVisibility('confirm-new-password', 'eye-reset-conf')" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-primary transition-colors">
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
        

        if (!password || password.length < 6) {
            showToast('La contraseña debe tener al menos 6 caracteres.');
            handleResetPasswordFlow(); // Reintentar
            return;
        }

        if (password !== confirm) {
            showToast('Las contraseñas no coinciden.');
            handleResetPasswordFlow(); // Reintentar
            return;
        }

        // 3. Ejecutar el cambio
        
        const res = await fetch(`${API_URL}/auth/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, password })
        });
        const data = await res.json();
        

        if (res.ok) {
            
            // 1. Limpieza INMEDIATA de la URL para que checkAuth no lo pesque de nuevo
            window.location.hash = '';
            window.history.replaceState(null, null, window.location.pathname);

            // 2. Mostrar alerta de éxito bloqueante
            await showAlert('¡Éxito!', data.message || 'Tu contraseña ha sido actualizada.', 'success');

            // 3. Forzar dashboard y re-autenticar
            localStorage.setItem('activeView', 'dashboard');
            checkAuth();
        } else {
            
            showToast(data.message || 'Error al resetear contraseña', 'error');
            // Si el error es por token expirado/inválido, limpiar y salir en vez de reintentar infinitamente
            if (data.message?.toLowerCase().includes('expirado') || data.message?.toLowerCase().includes('inválido')) {
                window.location.hash = '';
                window.history.replaceState(null, null, window.location.pathname);
                checkAuth();
            } else {
                handleResetPasswordFlow(); // Reintentar si fue otro error (ej. conexión momentánea)
            }
        }
    } catch (e) {
        
        showToast('Falla técnica: ' + e.message);
    }
}

function logout(force = false) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    // Si fue forzado por seguridad inactividad, no guardamos la ultima vista para evitar leaks de privacidad al recargar sin token
    if (force) localStorage.removeItem('activeView');
    window.location.reload();
}

// Navegación Básica SPA
function navigate(view) {
    // Guardar la vista activa para restaurarla al recargar
    localStorage.setItem('activeView', view);

    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('text-primary');
        el.classList.add('text-slate-400');
        if (el.dataset.target === view) {
            el.classList.add('text-primary');
            el.classList.remove('text-slate-400');
        }
    });

    if (view === 'dashboard') {
        loadDashboard();
    } else if (view === 'reservations') {
        loadReservations();
    } else if (view === 'calendar') {
        loadCalendar();
    } else if (view === 'users') {
        loadUsers();
    } else if (view === 'logs') {
        loadLogs();
    }
}

async function loadDashboard() {
    const main = document.getElementById('main-content');
    const user = JSON.parse(localStorage.getItem('user'));

    // Fetch Espacios Activos
    try {
        const res = await fetch(`${API_URL}/spaces`);
        mySpaces = await res.json();
    } catch (e) {  }

    let spacesHtml = mySpaces.map(s => `
        <div class="group relative h-64 sm:h-72 rounded-2xl overflow-hidden cursor-pointer" onclick="openModal(${s.id})">
            <img class="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                 src="${s.image_url || 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iMzAwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMWUyOTNiIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjI0IiBmaWxsPSIjOTRBMzI4IiBkeT0iLjNlbSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+RXNwYWNpbzwvdGV4dD48L3N2Zz4='}" alt="${s.name}" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iMzAwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMWUyOTNiIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjI0IiBmaWxsPSIjOTRBMzI4IiBkeT0iLjNlbSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+RXNwYWNpbzwvdGV4dD48L3N2Zz4=''">
            <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent"></div>
            <div class="absolute bottom-0 left-0 right-0 p-5 glass-card border-0 border-t border-white/10 m-3 rounded-xl flex justify-between items-center">
                <div>
                    <p class="font-bold text-sm text-white">${s.name}</p>
                </div>
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

let allReservations = [];

async function loadReservations() {
    const main = document.getElementById('main-content');
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));
    const isAdmin = user && user.role === 'admin';

    try {
        const url = isAdmin ? `${API_URL}/reservations` : `${API_URL}/reservations/my-reservations`;
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        allReservations = await res.json();

        main.innerHTML = `
            <section>
                <div class="flex flex-col md:flex-row justify-between items-start md:items-end mb-4 gap-4">
                    <h2 class="text-xl font-bold">${isAdmin ? 'Gestión de Reservas' : 'Mis Reservas'}</h2>
                    
                    <div class="flex flex-wrap gap-2 w-full md:w-auto">
                        <input title="Filtrar por fecha" type="date" id="filter-date" onchange="renderReservations()" class="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary">
                        
                        <select title="Filtrar por estado" id="filter-status" onchange="renderReservations()" class="bg-slate-800 border border-slate-700 text-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary">
                            <option value="">Todos los estados</option>
                            <option value="pendiente">Pendiente</option>
                            <option value="aprobada">Aprobada</option>
                            <option value="rechazada">Rechazada</option>
                            <option value="cancelada">Cancelada</option>
                        </select>

                        ${isAdmin ? `
                        <input title="Buscar por usuario" type="text" id="filter-user" onkeyup="renderReservations()" placeholder="Buscar usuario..." class="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary placeholder:text-slate-500">
                        ` : ''}
                    </div>
                </div>
                <div id="reservations-list" class="space-y-3"></div>
            </section>
        `;

        renderReservations();
    } catch (e) {
        
        main.innerHTML = `<p class="text-red-500 font-bold p-4">Error cargando las reservas. Verifica tu conexión.</p>`;
    }
}

async function loadCalendar() {
    const main = document.getElementById('main-content');
    const token = localStorage.getItem('token');

    main.innerHTML = `
        <section class="h-full flex flex-col">
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-xl font-bold">Calendario de Ocupación</h2>
                <button onclick="openModal()" class="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-xl font-bold transition-colors shadow-lg shadow-primary/30">
                    <span class="material-symbols-outlined text-sm">add_circle</span>
                    Nueva Reserva
                </button>
            </div>
            <div class="glass-card p-4 rounded-xl flex-1 min-h-[500px] overflow-hidden">
                <div id="calendar" class="h-full pt-2"></div>
            </div>
        </section>
    `;

    try {
        const res = await fetch(`${API_URL}/reservations/calendar`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const eventsData = await res.json();

        const events = eventsData.map(r => ({
            id: r.id,
            title: `${r.space_name} (${r.user_name.split(' ')[0]})`,
            start: r.start_time,
            end: r.end_time,
            color: r.status === 'aprobada' ? '#2b6cee' : '#f97316', // primary o orange
            extendedProps: {
                status: r.status,
                description: r.description
            }
        }));

        const isMobile = window.innerWidth < 768;

        const calendarEl = document.getElementById('calendar');
        const calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: isMobile ? 'timeGridDay' : 'timeGridWeek',
            locale: 'es',
            headerToolbar: isMobile
                ? {
                    left: 'prev,next',
                    center: 'title',
                    right: 'today'
                }
                : {
                    left: 'prev,next today',
                    center: 'title',
                    right: 'dayGridMonth,timeGridWeek,timeGridDay'
                },
            footerToolbar: isMobile
                ? { center: 'dayGridMonth,timeGridWeek,timeGridDay' }
                : false,
            buttonText: {
                today: 'Hoy',
                month: 'Mes',
                week: 'Sem',
                day: 'Día'
            },
            slotMinTime: '08:00:00',
            slotMaxTime: '22:00:00',
            allDaySlot: false,
            displayEventTime: true,
            displayEventEnd: true,
            eventTimeFormat: {
                hour: '2-digit',
                minute: '2-digit',
                meridiem: false
            },
            events: events,
            eventContent: function (arg) {
                let timeText = arg.timeText;
                let descHtml = arg.event.extendedProps.description && !isMobile
                    ? `<div class="text-[10px] opacity-80 italic line-clamp-2 mt-0.5 leading-tight">${arg.event.extendedProps.description}</div>`
                    : '';
                return {
                    html: `
                        <div class="px-1 py-0.5 w-full h-full overflow-hidden flex flex-col justify-start">
                            <div class="font-bold text-xs truncate block">${arg.event.title}</div>
                            <div class="text-[10px] opacity-90 font-medium">${timeText}</div>
                            ${descHtml}
                        </div>
                    `
                };
            },
            eventClick: function (info) {
                const statusStr = info.event.extendedProps.status === 'aprobada' ? 'Aprobada' : 'Pendiente';
                showToast(`Reserva ${statusStr}: ${info.event.title}`, 'success');
            }
        });

        calendar.render();
    } catch (e) {
        
        showToast('Error cargando el calendario', 'error');
    }
}

function renderReservations() {
    const container = document.getElementById('reservations-list');
    if (!container) return;

    const user = JSON.parse(localStorage.getItem('user'));
    const isAdmin = user && user.role === 'admin';

    const filterDate = document.getElementById('filter-date')?.value || '';
    const filterStatus = document.getElementById('filter-status')?.value || '';
    const filterUser = document.getElementById('filter-user')?.value.toLowerCase() || '';

    const filtered = allReservations.filter(r => {
        let matchDate = true;
        let matchStatus = true;
        let matchUser = true;

        if (filterDate) {
            matchDate = r.start_time >= filterDate;
        }
        if (filterStatus) {
            matchStatus = r.status === filterStatus;
        }
        if (filterUser && isAdmin) {
            matchUser = (r.user_name && r.user_name.toLowerCase().includes(filterUser)) ||
                (r.user_email && r.user_email.toLowerCase().includes(filterUser));
        }

        return matchDate && matchStatus && matchUser;
    });

    // Ordenar de forma descendente (las más nuevas o futuras primero) dependiente del requerimiento, 
    // en este caso el usuario pide fecha descendente (las más lejanas primero o las más recientes primero)
    // new Date(b) - new Date(a) es descendente
    filtered.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));

    let reservasHtml = filtered.map(r => `
        <div class="glass-card p-4 rounded-xl border-l-4 ${r.status === 'aprobada' ? 'border-l-primary' : r.status === 'pendiente' ? 'border-l-orange-500' : r.status === 'cancelada' ? 'border-l-slate-500' : 'border-l-red-500'}">
            <div class="flex justify-between items-start">
                <div>
                    <p class="font-bold text-slate-100">${r.space_name}</p>
                    ${isAdmin ? `<p class="text-[10px] text-slate-400 mt-1">Usuario: ${r.user_name} (${r.user_email})</p>` : ''}
                    ${r.comments ? `<p class="text-xs text-slate-500 mt-1 italic">"${r.comments}"</p>` : ''}
                </div>
                <span class="uppercase text-[10px] font-bold px-2 py-1 rounded-full ${r.status === 'aprobada' ? 'bg-primary/20 text-primary' : r.status === 'pendiente' ? 'bg-orange-500/20 text-orange-400' : r.status === 'cancelada' ? 'bg-slate-500/20 text-slate-400' : 'bg-red-500/20 text-red-400'}">${r.status}</span>
            </div>
            <div class="flex justify-between items-center mt-3 pt-3 border-t border-white/5">
                <span class="text-xs text-slate-400">${new Date(r.start_time).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })} - ${new Date(r.end_time).toLocaleTimeString('es-ES', { timeStyle: 'short' })}</span>
                
                ${isAdmin && r.status === 'pendiente' ? `
                <div class="flex gap-2">
                    <button onclick="updateReservationStatus(${r.id}, 'aprobada')" class="px-3 py-1 bg-primary/20 hover:bg-primary/40 text-primary hover:text-white rounded-lg text-xs font-bold transition-colors">Aprobar</button>
                    <button onclick="updateReservationStatus(${r.id}, 'rechazada')" class="px-3 py-1 bg-red-500/20 hover:bg-red-500/40 text-red-400 hover:text-white rounded-lg text-xs font-bold transition-colors">Rechazar</button>
                </div>` : ''}

                ${['pendiente', 'aprobada'].includes(r.status) ? `
                <button onclick="cancelReservation(${r.id})" class="px-3 py-1 bg-red-500/10 hover:bg-red-500/30 text-red-400 rounded-lg text-xs font-bold transition-colors" title="${isAdmin ? 'Anular reserva de manera forzosa' : 'Cancelar mi reserva'}">Cancelar</button>
                ` : ''}
            </div>
        </div>
    `).join('');

    container.innerHTML = filtered.length ? reservasHtml : `<p class="text-slate-500 text-sm glass-card p-6 text-center rounded-xl font-medium">No se encontraron reservas.</p>`;
}

async function updateReservationStatus(id, newStatus) {
    const isConfirmed = await showConfirm(`¿Seguro que deseas marcar la reserva como '${newStatus}'?`);
    if (!isConfirmed) return;
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_URL}/reservations/${id}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ status: newStatus })
        });
        if (res.ok) {
            showToast('Reserva actualizada', 'success');
            loadReservations();
        } else {
            showToast('Error al actualizar la reserva');
        }
    } catch (e) { showToast('Error de red'); }
}

async function cancelReservation(id) {
    const isConfirmed = await showConfirm('¿Seguro que deseas cancelar tu reserva?');
    if (!isConfirmed) return;
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_URL}/reservations/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            showToast('Reserva cancelada', 'success');
            loadReservations();
        } else {
            showToast('Error al cancelar');
        }
    } catch (e) { showToast('Error de red'); }
}

// Modal Form Logic
function openModal(preselectedSpaceId = null) {
    const modal = document.getElementById('modal-overlay');
    const modalContent = document.getElementById('reservation-modal');

    // Populate select
    const select = document.getElementById('form-space');
    select.innerHTML = mySpaces.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

    if (preselectedSpaceId) {
        select.value = preselectedSpaceId;
    }

    // Default dates and times
    const d = new Date();
    document.getElementById('form-date').value = d.toISOString().split('T')[0];
    document.getElementById('form-start-time').value = '09:00';
    document.getElementById('form-end-time').value = '10:00';

    // Clean residual data
    document.getElementById('form-comments').value = '';
    const allDayCheckbox = document.getElementById('form-all-day');
    if (allDayCheckbox) {
        allDayCheckbox.checked = false;
        document.getElementById('time-inputs-container').classList.remove('opacity-30', 'pointer-events-none');
    }

    modal.classList.add('modal-active');
    // slight delay to enable transition
    setTimeout(() => {
        modalContent.classList.add('modal-slide-up');
    }, 10);
}

function closeModal() {
    const modal = document.getElementById('modal-overlay');
    const modalContent = document.getElementById('reservation-modal');

    modalContent.classList.remove('modal-slide-up');
    setTimeout(() => {
        modal.classList.remove('modal-active');
    }, 300);
}

function toggleAllDay() {
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

// Lógica Nuevo Espacio (Admin)
let editingSpaceId = null;

function openSpaceModal(id = null) {
    editingSpaceId = id;
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

function editSpace(id) {
    openSpaceModal(id);
}

async function deleteSpace(id) {
    const isConfirmed = await showConfirm('¿Estás seguro de desactivar/eliminar este espacio?');
    if (!isConfirmed) return;
    try {
        const res = await apiFetch(`${API_URL}/spaces/${id}`, {
            method: 'DELETE'
        });
        if (!res) return;
        if (res.ok) {
            showToast('Espacio eliminado', 'success');
            loadDashboard();
        }
        else showToast('Error al borrar espacio.');
    } catch (e) { showToast('Error de red.'); }
}

function closeSpaceModal() {
    const modal = document.getElementById('modal-space-overlay');
    const modalContent = document.getElementById('space-modal');
    modalContent.classList.remove('modal-slide-up');
    setTimeout(() => modal.classList.remove('modal-active'), 300);
}

async function saveNewSpace() {
    const name = document.getElementById('space-name').value;
    const description = document.getElementById('space-desc').value;
    const image_url = document.getElementById('space-image-url').value;

    if (!name) return showToast('El nombre es requerido.');

    const token = localStorage.getItem('token');
    try {
        const url = editingSpaceId ? `${API_URL}/spaces/${editingSpaceId}` : `${API_URL}/spaces`;
        const method = editingSpaceId ? 'PUT' : 'POST';

        const res = await apiFetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description, image_url, is_active: true })
        });
        if (!res) return;
        const data = await res.json();
        if (res.ok) {
            showToast(editingSpaceId ? 'Espacio actualizado.' : 'Espacio creado con éxito.', 'success');
            closeSpaceModal();
            loadDashboard(); // Recargar la lista de espacios
        } else {
            showToast(data.message || 'Error al guardar.');
        }
    } catch (e) { showToast('Error de red.'); }
}

async function submitReservation() {
    const spaceId = document.getElementById('form-space').value;
    const date = document.getElementById('form-date').value;
    const start = document.getElementById('form-start-time').value;
    const end = document.getElementById('form-end-time').value;
    const comments = document.getElementById('form-comments').value;

    if (!spaceId || !date || !start || !end) {
        showToast("Por favor completa los campos requeridos.", 'error');
        return;
    }

    const start_time = `${date}T${start}:00`;
    const end_time = `${date}T${end}:00`;

    if (new Date(start_time) >= new Date(end_time)) {
        showToast("La hora de fin debe ser posterior a la de inicio.", 'error');
        return;
    }

    // Preparar info legible para el resumen
    const spaceInput = document.getElementById('form-space');
    const spaceName = spaceInput.options[spaceInput.selectedIndex]?.text || 'Espacio';
    const uiDateParts = date.split('-');
    const uiDateString = `${uiDateParts[2]}/${uiDateParts[1]}/${uiDateParts[0]}`; // DD/MM/YYYY
    const isAllDay = document.getElementById('form-all-day').checked;

    // Armar el "Ticket" HTML seguro pre-reserva (Diseño Premium Stitch)
    let resumeHtml = `
        <div class="w-full bg-slate-900 border border-slate-700/80 rounded-xl p-5 mb-2 mt-2 space-y-3">
            <div class="flex flex-col gap-2">
                <div class="flex items-start gap-3">
                    <span class="material-symbols-outlined text-primary text-xl mt-0.5">meeting_room</span>
                    <p class="text-slate-200 text-base font-medium">Espacio: ${escapeHTML(spaceName)}</p>
                </div>
                <div class="flex items-start gap-3">
                    <span class="material-symbols-outlined text-primary text-xl mt-0.5">calendar_today</span>
                    <p class="text-slate-200 text-base">Fecha: ${escapeHTML(uiDateString)}</p>
                </div>
                <div class="flex items-start gap-3">
                    <span class="material-symbols-outlined text-primary text-xl mt-0.5">schedule</span>
                    <p class="text-slate-200 text-base">Horario: ${isAllDay ? 'Todo el día' : `${escapeHTML(start)} a ${escapeHTML(end)}`}</p>
                </div>
            </div>
            ${comments ? `
            <div class="pt-3 border-t border-slate-700/50">
                <p class="text-slate-400 italic text-sm">"${escapeHTML(comments)}"</p>
            </div>` : ''}
        </div>
        <p class="text-slate-400 text-sm mt-4 text-center uppercase tracking-widest font-medium">Resumen de solicitud</p>
    `;

    const isConfirmed = await showConfirm(resumeHtml, true);
    if (!isConfirmed) return; // Si cancela, abandonamos y el Modal #1 sigue abierto.

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
            const activeTab = document.querySelector('.nav-item.text-primary').dataset.target;
            if (activeTab === 'dashboard') {
                loadDashboard();
            } else if (activeTab === 'calendar') {
                loadCalendar();
            } else {
                loadReservations();
            }
        } else {
            showToast(data.message || 'Error al crear la reserva');
        }
    } catch (e) {
        showToast('Error de conexión.');
    } finally {
        btn.innerHTML = `<span>Confirmar Reserva</span>`;
        btn.disabled = false;
    }
}

// Initialization
window.addEventListener('DOMContentLoaded', () => {
    checkAuth();
});

// ================= ADMIN USUARIOS =================
async function loadUsers(page = 1, search = null) {
    currentUsersPage = page;
    if (search !== null) currentUsersSearch = search;

    const main = document.getElementById('main-content');
    const token = localStorage.getItem('token');

    // Loader si es la primera carga o cambio de página
    if (!document.getElementById('users-search-input')) {
        main.innerHTML = `<div class="p-8 text-center text-slate-500"><span class="material-symbols-outlined animate-spin text-4xl">sync</span><p class="mt-2 font-medium">Cargando usuarios...</p></div>`;
    }

    try {
        const queryParams = new URLSearchParams({
            page: currentUsersPage,
            limit: currentUsersLimit,
            search: currentUsersSearch
        }).toString();

        const res = await apiFetch(`${API_URL}/users?${queryParams}`);
        if (!res) return;

        if (!res.ok) {
            showToast('Error de permisos o red al cargar usuarios');
            return;
        }

        const data = await res.json();
        renderUsers(data, main);
    } catch (e) {
        showToast('Error de red cargando usuarios');
    }
}

function renderUsers(data, container) {
    const { users, total, totalPages, page } = data;
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

    let usersHtml = users.map(u => `
        <div class="glass-card p-4 rounded-xl shadow-lg border border-white/5 flex flex-col js-user-card transition-all hover:border-primary/20" data-id="${u.id}">
            <div class="flex items-center gap-4 border-b border-white/5 pb-3 mb-3">
                <div class="size-10 bg-slate-800 rounded-full overflow-hidden border border-slate-700 shrink-0">
                    <img src="${u.avatar_url || 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0id2hpdGUiPjxwYXRoIGQ9Ik0xMiAxMmM0LjQxMSAwIDgtMy41ODkgOC04cy0zLjU4OS04LTgtOC04IDMuNTg5LTggOHMzLjU4OSA4IDggOHptMC0xNGM0LjQxMSAwIDggMy41ODkgOCA4czMuNTg5IDggOCA4IDgtMy41ODkgOC04cy0zLjU4OS04LTgtOHptMCAxNGMtNC45NjUgMC0xNC40IDMuNjMyLTE0LjQgMTAuOHYuMWgyOC44di0uMWMwLTcuMjY4LTkuNDM1LTEwLjktMTQuNC0xMC45em0tMTIuMyA5YzEtNC41MiA1LjgyNi02LjkgMTIuMy02LjlzMTEuMyAyLjM4IDEyLjMgNi45aC0yNC42eiIvPjwvc3ZnPg=='}" alt="Avatar" class="w-full h-full object-cover">
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
                        class="size-8 flex items-center justify-center rounded-lg border transition-all 
                        ${u.is_active ? 'border-red-500/30 text-red-400 hover:bg-red-500/10' : 'border-green-500/30 text-green-400 hover:bg-green-500/10'}">
                        <span class="material-symbols-outlined text-[18px]">${u.is_active ? 'block' : 'check_circle'}</span>
                    </button>
                    <button onclick="changeUserRole(${u.id}, '${u.role}')" title="${u.role === 'admin' ? 'Quitar Admin' : 'Hacer Admin'}"
                        class="size-8 flex items-center justify-center rounded-lg border transition-all
                        ${u.role === 'admin' ? 'border-orange-500/30 text-orange-400 hover:bg-orange-500/10' : 'border-primary/30 text-primary hover:bg-primary/10'}">
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
            ${users.length ? usersHtml : '<div class="col-span-full p-12 text-center glass-card rounded-2xl border border-dashed border-slate-700 text-slate-500 italic">No se encontraron usuarios coincidentes.</div>'}
        </div>

        <!-- Paginación Usuarios -->
        <div class="flex items-center justify-between px-2 mt-8 text-sm text-slate-400 font-bold border-t border-slate-800 pt-6">
            <div class="flex items-center gap-3">
                <span class="opacity-70">Total: ${total}</span>
                <div class="h-4 w-px bg-slate-700 mx-1"></div>
                <div class="flex items-center gap-2">
                    <span class="text-[11px] uppercase tracking-tighter opacity-50">Mostrar:</span>
                    <select onchange="changeUsersLimit(this.value)" class="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-slate-300 outline-none focus:border-primary">
                        ${[10, 20, 50, 100].map(v => `<option value="${v}" ${v === currentUsersLimit ? 'selected' : ''}>${v}</option>`).join('')}
                    </select>
                </div>
                <div class="hidden sm:flex h-4 w-px bg-slate-700 mx-1"></div>
                <div class="hidden sm:flex items-center gap-2">
                    <span class="text-[11px] uppercase tracking-tighter opacity-50">Ir a:</span>
                    <select onchange="loadUsers(parseInt(this.value))" class="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-slate-300 outline-none focus:border-primary">
                        ${pageOptions}
                    </select>
                </div>
            </div>
            <div class="flex gap-2 items-center">
                <span class="text-[10px] opacity-50 mr-2 uppercase tracking-tight">Página ${page} / ${totalPages || 1}</span>
                <button onclick="loadUsers(${page - 1})" ${page <= 1 ? 'disabled' : ''} class="w-8 h-8 bg-slate-800/80 rounded-lg border border-slate-700 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-700 transition flex items-center justify-center shadow-lg">
                    <span class="material-symbols-outlined text-lg block">chevron_left</span>
                </button>
                <button onclick="loadUsers(${page + 1})" ${page >= totalPages ? 'disabled' : ''} class="w-8 h-8 bg-slate-800/80 rounded-lg border border-slate-700 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-700 transition flex items-center justify-center shadow-lg">
                    <span class="material-symbols-outlined text-lg block">chevron_right</span>
                </button>
            </div>
        </div>
    `;
}

function changeUsersLimit(limit) {
    currentUsersLimit = parseInt(limit);
    loadUsers(1);
}

async function toggleUserStatus(id, currentlyActive) {
    const word = currentlyActive ? 'suspender' : 'activar';
    const ok = await showConfirm(`¿Estás seguro de ${word} este usuario?`);
    if (!ok) return;

    const token = localStorage.getItem('token');
    try {
        const res = await apiFetch(`${API_URL}/users/${id}/toggle-status`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            showToast(`Usuario modificado`, 'success');
            loadUsers();
        } else {
            const data = await res.json();
            showToast(data.message || 'Error al cambiar estado');
        }
    } catch (error) {
        showToast('Error de red');
    }
}

async function changeUserRole(id, currentRole) {
    const newRoleLabel = currentRole === 'admin' ? 'usuario normal' : 'Administrador';
    const ok = await showConfirm(`¿Querés cambiar el rol de este usuario a "${newRoleLabel}"?`);
    if (!ok) return;

    const token = localStorage.getItem('token');
    try {
        const res = await apiFetch(`${API_URL}/users/${id}/change-role`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (res.ok) {
            showToast(data.message || 'Rol actualizado', 'success');
            loadUsers();
        } else {
            showToast(data.message || 'Error al cambiar el rol');
        }
    } catch (error) {
        showToast('Error de red');
    }
}

let currentLogsPage = 1;
let currentLogsLimit = 10;
let currentLogsFilters = {};
let availableLogActions = []; // Cache para el combo

// --- Variables para Gestión de Usuarios ---
let currentUsersPage = 1;
let currentUsersLimit = 10;
let currentUsersSearch = '';

async function loadLogActions() {
    if (availableLogActions.length > 0) return;
    try {
        const res = await apiFetch(`${API_URL}/logs/actions`);
        if (res && res.ok) {
            availableLogActions = await res.json();
        }
    } catch (e) {  }
}

async function loadLogs(page = 1, applyFilters = false) {
    currentLogsPage = page;
    const main = document.getElementById('main-content');

    if (applyFilters) {
        currentLogsFilters = {
            startDate: document.getElementById('log-filter-start')?.value || '',
            endDate: document.getElementById('log-filter-end')?.value || '',
            userSearch: document.getElementById('log-filter-user')?.value || '',
            action: document.getElementById('log-filter-action')?.value || ''
        };
    }

    const existingFilters = document.getElementById('log-filters-bar');
    if (!existingFilters) {
        main.innerHTML = `<div class="p-8 text-center text-slate-500"><span class="material-symbols-outlined animate-spin text-4xl">sync</span><p class="mt-2 font-medium">Cargando registros de auditoría...</p></div>`;
    }

    // Cargar acciones para el combo (se ejecuta solo la primera vez)
    await loadLogActions();

    try {
        const queryParams = new URLSearchParams({
            page,
            limit: currentLogsLimit,
            ...currentLogsFilters
        }).toString();

        const res = await apiFetch(`${API_URL}/logs?${queryParams}`);
        if (!res) return;
        const data = await res.json();

        const logsHtml = data.logs.map(l => {
            const date = new Date(l.created_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
            return `
                <tr class="border-b border-slate-700/50 hover:bg-slate-800/50 transition-colors">
                    <td class="p-4 text-xs font-mono text-slate-400 whitespace-nowrap">${date}</td>
                    <td class="p-4">
                        <div class="font-bold text-sm text-slate-200 capitalize">${escapeHTML(l.user_name || 'Desconocido')}</div>
                        <div class="text-[10px] text-slate-500">${escapeHTML(l.user_email || 'n/a')}</div>
                    </td>
                    <td class="p-4">
                        <span class="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded border border-slate-600 ${l.action.includes('DELETE') || l.action.includes('CANCEL') || l.action.includes('SUSPEND') ? 'bg-red-500/10 text-red-400 border-red-500/30' : l.action.includes('CREATE') || l.action.includes('ACTIVATE') ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-slate-800 text-slate-300'}">${escapeHTML(l.action)}</span>
                        <div class="text-[10px] text-slate-500 mt-1 font-bold">${escapeHTML(l.entity)} ${l.entity_id ? `(#${l.entity_id})` : ''} ${l.space_id ? `<span class="italic font-normal">| Espacio #${l.space_id}</span>` : ''}</div>
                    </td>
                    <td class="p-4 text-xs text-slate-400 font-mono w-1/3">
                        <div class="bg-slate-900/50 p-2 rounded max-h-16 overflow-y-auto no-scrollbar">${escapeHTML(JSON.stringify(l.details) || '{}')}</div>
                    </td>
                    <td class="p-4 text-xs text-slate-500 text-right font-mono">
                        ${escapeHTML(l.ip_address ? l.ip_address.split(':').pop() : '-')}
                    </td>
                </tr>
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
                    
                    <input type="text" id="log-filter-user" value="${currentLogsFilters.userSearch || ''}" 
                        onkeyup="if(event.key === 'Enter') loadLogs(1, true)"
                        placeholder="Usuario / Email..." title="Buscar por usuario o email" 
                        class="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary placeholder:text-slate-500 h-9 w-40">
                    
                    <select id="log-filter-action" title="Filtrar por tipología" class="bg-slate-800 border border-slate-700 text-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary h-9 cursor-pointer">
                        <option value="">Todas las acciones</option>
                        ${availableLogActions.map(a => `<option value="${a}" ${currentLogsFilters.action === a ? 'selected' : ''}>${a}</option>`).join('')}
                    </select>

                    <button onclick="loadLogs(1, true)" class="h-9 w-9 flex items-center justify-center bg-primary text-white rounded-lg transition-all active:scale-95 shadow-lg shadow-primary/20" title="Filtrar">
                        <span class="material-symbols-outlined text-[20px]">search</span>
                    </button>

                    <button onclick="loadLogs(currentLogsPage)" title="Refrescar" class="p-2 bg-slate-800/80 rounded-lg border border-slate-700 hover:bg-slate-700 hover:text-white transition-colors text-slate-400 active:scale-95">
                        <span class="material-symbols-outlined text-[18px] block">refresh</span>
                    </button>
                </div>
            </div>
            
            <div class="glass-card rounded-2xl overflow-hidden border border-slate-700/50 shadow-2xl">
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse min-w-[800px]">
                        <thead>
                            <tr class="bg-slate-900/60 text-[10px] uppercase font-bold tracking-widest text-slate-500 border-b border-slate-700">
                                <th class="p-4 w-32">Fecha</th>
                                <th class="p-4">Usuario</th>
                                <th class="p-4">Tipología</th>
                                <th class="p-4">Detalles Base</th>
                                <th class="p-4 text-right">Dirección IP</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-700/30">
                            ${data.logs.length ? logsHtml : '<tr><td colspan="5" class="p-8 text-center text-slate-500 text-sm italic">No se encontraron registros con los filtros aplicados.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Paginación Navbar -->
            <div class="flex items-center justify-between px-2 mt-6 text-sm text-slate-400 font-bold">
                <div class="flex items-center gap-3">
                    <span class="opacity-70">Total: ${data.total}</span>
                    <div class="h-4 w-px bg-slate-700 mx-1"></div>
                    <div class="flex items-center gap-2">
                        <span class="text-[11px] uppercase tracking-tighter opacity-50">Mostrar:</span>
                        <select onchange="changeLogsLimit(this.value)" class="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-slate-300 outline-none focus:border-primary">
                            ${[10, 20, 30, 40, 50].map(v => `<option value="${v}" ${v === currentLogsLimit ? 'selected' : ''}>${v}</option>`).join('')}
                        </select>
                    </div>
                    <div class="h-4 w-px bg-slate-700 mx-1"></div>
                    <div class="flex items-center gap-2">
                        <span class="text-[11px] uppercase tracking-tighter opacity-50">Saltar a:</span>
                        <select onchange="loadLogs(parseInt(this.value))" class="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-slate-300 outline-none focus:border-primary">
                            ${pageOptions}
                        </select>
                    </div>
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
    } catch (e) {
        showToast('Error cargando auditoría de registros');
    }
}

function changeLogsLimit(limit) {
    currentLogsLimit = parseInt(limit);
    loadLogs(1); // Reiniciar a la primera página con el nuevo límite
}

async function generateResetLink(id) {
    
    const ok = await showConfirm(`¿Querés generar un link de recuperación para este usuario? El token anterior (si existe) quedará invalidado.`);
    

    if (!ok) return;

    try {
        
        const res = await apiFetch(`${API_URL}/users/${id}/generate-reset-token`, {
            method: 'POST'
        });
        const data = await res.json();
        

        if (res.ok) {
            const resetLink = `${window.location.origin}/#reset?token=${data.token}`;
            

            const modalContent = `
                <div class="space-y-4 pt-2">
                    <p class="text-xs text-slate-400 uppercase tracking-widest font-bold text-center">Acceso Único</p>
                    <div class="relative group">
                        <input id="reset-link-input" type="text" readonly value="${resetLink}" 
                            class="w-full bg-slate-950 border border-slate-700/50 rounded-xl p-4 pr-12 text-[13px] text-primary font-mono outline-none shadow-2xl focus:border-primary/50 transition-all">
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
        } else {
            
            showToast(data.message || 'Error al generar el token');
        }
    } catch (e) {
        
        showToast('Error de red');
    }
}

function copyResetLink() {
    const input = document.getElementById('reset-link-input');
    if (!input) return;
    input.select();
    navigator.clipboard.writeText(input.value);
    showToast('¡Link copiado al portapapeles!', 'success');
}
