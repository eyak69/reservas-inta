const API_URL = '/api';
let mySpaces = [];

// ======= FETCH CON INTERCEPCIÓN AUTOMÁTICA DE 401/403 =======
async function apiFetch(url, options = {}) {
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

function showConfirm(message) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('confirm-modal-overlay');
        const modal = document.getElementById('confirm-modal');
        const msgEl = document.getElementById('confirm-message');
        const btnCancel = document.getElementById('btn-confirm-cancel');
        const btnAccept = document.getElementById('btn-confirm-accept');

        msgEl.innerText = message;
        overlay.classList.remove('hidden');

        // Timeout para que la transición CSS funcione al quitar hidden
        setTimeout(() => modal.classList.add('modal-scale-up'), 10);

        const closeModal = (result) => {
            modal.classList.remove('modal-scale-up');
            setTimeout(() => {
                overlay.classList.add('hidden');
                resolve(result);
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
let currentCaptchaToken = '';

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
            // Usuario pendiente de aprobación
            showPendingScreen(data.message);
        } else if (res.ok && data.token) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            checkAuth();
        } else {
            showToast(data.message || 'Error al iniciar sesión');
        }
    } catch (e) { showToast('Error de red'); }
}

async function submitRegister() {
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const captchaText = document.getElementById('reg-captcha').value;

    if (!name || !email || !password || !captchaText) return showToast('Completa todos los campos');

    try {
        const res = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password, captchaText, captchaToken: currentCaptchaToken })
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
                // Usuario nuevo o pendiente de aprobación — mostrar pantalla de espera
                showPendingScreen(body.message);
            } else if (body.token) {
                localStorage.setItem('token', body.token);
                localStorage.setItem('user', JSON.stringify(body.user));
                checkAuth();
            } else {
                showToast('Error en login: ' + (body.message || 'Error desconocido'), 'error');
            }
        })
        .catch(err => {
            console.error(err);
            showToast('Error de conexión con Google.', 'error');
        });
}

// Verificación de estado de sesión
async function checkAuth() {
    const token = localStorage.getItem('token');
    if (token) {
        // Verificar con el backend que el usuario sigue existiendo y activo
        try {
            const res = await fetch(`${API_URL}/users/profile`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) {
                // Usuario eliminado, deshabilitado o token inválido
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                document.getElementById('auth-view').classList.remove('hidden');
                document.getElementById('app-view').classList.add('hidden');
                document.getElementById('app-view').classList.remove('flex');
                if (res.status === 403) {
                    showToast('Tu cuenta ha sido deshabilitada o eliminada.', 'error');
                } else {
                    showToast('Sesión expirada. Por favor iniciá sesión nuevamente.', 'error');
                }
                return;
            }
            // Actualizar datos del usuario con la respuesta fresca del servidor
            const freshUser = await res.json();
            localStorage.setItem('user', JSON.stringify({
                id: freshUser.id,
                name: freshUser.name,
                email: freshUser.email,
                role: freshUser.role,
                avatar_url: freshUser.avatar_url
            }));
        } catch (e) {
            // Si hay error de red, dejar pasar (evitar logout por desconexión temporal)
            console.warn('No se pudo verificar la sesión con el servidor:', e.message);
        }

        const user = JSON.parse(localStorage.getItem('user') || '{}');
        document.getElementById('auth-view').classList.add('hidden');
        document.getElementById('app-view').classList.remove('hidden');
        document.getElementById('app-view').classList.add('flex');

        document.getElementById('user-avatar').src = user.avatar_url || 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0id2hpdGUiPjxwYXRoIGQ9Ik0xMiAxMmM0LjQxMSAwIDgtMy41ODkgOC04cy0zLjU4OS04LTgtOC04IDMuNTg5LTggOHMzLjU4OSA4IDggOHptMC0xNGM0LjQxMSAwIDggMy41ODkgOCA4czMuNTg5IDggOCA4IDgtMy41ODkgOC04cy0zLjU4OS04LTgtOHptMCAxNGMtNC45NjUgMC0xNC40IDMuNjMyLTE0LjQgMTAuOXYuMWgyOC44di0uMWMwLTcuMjY4LTkuNDM1LTEwLjktMTQuNC0xMC45em0tMTIuMyA5YzEtNC41MiA1LjgyNi02LjkgMTIuMy02LjlzMTEuMyAyLjM4IDEyLjMgNi45aC0yNC42eiIvPjwvc3ZnPg==';

        const navUsers = document.getElementById('nav-users');
        if (user.role === 'admin') {
            navUsers.classList.remove('hidden');
            navUsers.classList.add('flex');
        } else {
            navUsers.classList.add('hidden');
            navUsers.classList.remove('flex');
        }

        loadDashboard();
    } else {
        document.getElementById('auth-view').classList.remove('hidden');
        document.getElementById('app-view').classList.add('hidden');
        document.getElementById('app-view').classList.remove('flex');
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    checkAuth();
}

// Navegación Básica SPA
function navigate(view) {
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
    }
}

async function loadDashboard() {
    const main = document.getElementById('main-content');
    const user = JSON.parse(localStorage.getItem('user'));

    // Fetch Espacios Activos
    try {
        const res = await fetch(`${API_URL}/spaces`);
        mySpaces = await res.json();
    } catch (e) { console.error('Error fetching spaces:', e); }

    let spacesHtml = mySpaces.map(s => `
        <div class="group relative h-48 rounded-xl overflow-hidden cursor-pointer" onclick="openModal(${s.id})">
            <img class="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
                 src="${s.image_url || 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iMzAwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMWUyOTNiIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjI0IiBmaWxsPSIjOTRBMzI4IiBkeT0iLjNlbSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+RXNwYWNpbzwvdGV4dD48L3N2Zz4='}" alt="${s.name}" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iMzAwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMWUyOTNiIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjI0IiBmaWxsPSIjOTRBMzI4IiBkeT0iLjNlbSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+RXNwYWNpbzwvdGV4dD48L3N2Zz4=''">
            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
            <div class="absolute bottom-0 left-0 right-0 p-4 glass-card border-0 border-t border-white/10 m-3 rounded-lg flex justify-between items-center">
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
        console.error('Error fetching reservations:', e);
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
        console.error(e);
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
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_URL}/spaces/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
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

        const res = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ name, description, image_url, is_active: true })
        });
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

    const token = localStorage.getItem('token');
    const btn = document.getElementById('btn-submit');
    btn.innerText = "Enviando...";
    btn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/reservations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ space_id: spaceId, start_time, end_time, comments })
        });

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
window.addEventListener('load', () => {
    checkAuth();
});

// ================= ADMIN USUARIOS =================
async function loadUsers() {
    const main = document.getElementById('main-content');
    const token = localStorage.getItem('token');

    main.innerHTML = `<div class="flex justify-center"><p class="text-slate-400 animate-pulse">Cargando usuarios...</p></div>`;

    try {
        const res = await fetch(`${API_URL}/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
            showToast('Error de permisos o red al cargar usuarios');
            return;
        }

        const users = await res.json();
        renderUsers(users, main);
    } catch (e) {
        showToast('Error de red cargando usuarios');
    }
}

function renderUsers(users, container) {
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

    let usersHtml = users.map(u => `
        <div class="glass-card p-4 rounded-xl shadow-lg border border-white/5 flex flex-col js-user-card" data-id="${u.id}">
            <div class="flex items-center gap-4 border-b border-white/5 pb-3 mb-3">
                <div class="size-10 bg-slate-800 rounded-full overflow-hidden border border-slate-700 shrink-0">
                    <img src="${u.avatar_url || 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0id2hpdGUiPjxwYXRoIGQ9Ik0xMiAxMmM0LjQxMSAwIDgtMy41ODkgOC04cy0zLjU4OS04LTgtOC04IDMuNTg5LTggOHMzLjU4OSA4IDggOHptMC0xNGM0LjQxMSAwIDggMy41ODkgOCA4czMuNTg5IDggOCA4IDgtMy41ODkgOC04cy0zLjU4OS04LTgtOHptMCAxNGMtNC45NjUgMC0xNC40IDMuNjMyLTE0LjQgMTAuOHYuMWgyOC44di0uMWMwLTcuMjY4LTkuNDM1LTEwLjktMTQuNC0xMC45em0tMTIuMyA5YzEtNC41MiA1LjgyNi02LjkgMTIuMy02LjlzMTEuMyAyLjM4IDEyLjMgNi45aC0yNC42eiIvPjwvc3ZnPg=='}" alt="Avatar" class="w-full h-full object-cover">
                </div>
                <div class="flex-1 truncate">
                    <h3 class="font-bold text-sm text-white truncate">${u.name}</h3>
                    <p class="text-xs text-slate-400 truncate font-mono">${u.email}</p>
                </div>
                <div class="shrink-0 flex flex-col items-end gap-1">
                    <span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${u.role === 'admin' ? 'bg-primary/20 text-primary' : 'bg-slate-700 text-slate-300'}">${u.role}</span>
                    <span class="text-[10px] lowercase font-bold ${u.is_active ? 'text-green-400' : 'text-amber-400'} flex items-center gap-1">
                        <span class="size-1.5 rounded-full ${u.is_active ? 'bg-green-400' : 'bg-amber-400'}"></span>
                        ${u.is_active ? 'Activo' : 'Pendiente/Suspendido'}
                    </span>
                </div>
            </div>
            
            <div class="flex justify-end gap-2 mt-1 flex-wrap">
                ${u.id !== currentUser.id ? `
                    <button onclick="toggleUserStatus(${u.id}, ${u.is_active})" class="text-xs font-bold px-3 py-1.5 rounded-lg border transition-all 
                        ${u.is_active ? 'border-red-500/30 text-red-400 hover:bg-red-500/10' : 'border-green-500/30 text-green-400 hover:bg-green-500/10'}">
                        ${u.is_active
                ? '<span class="material-symbols-outlined text-[14px] align-middle mr-1">block</span>Suspender'
                : '<span class="material-symbols-outlined text-[14px] align-middle mr-1">check_circle</span>Activar'}
                    </button>
                    <button onclick="changeUserRole(${u.id}, '${u.role}')" class="text-xs font-bold px-3 py-1.5 rounded-lg border transition-all
                        ${u.role === 'admin' ? 'border-orange-500/30 text-orange-400 hover:bg-orange-500/10' : 'border-primary/30 text-primary hover:bg-primary/10'}">
                        ${u.role === 'admin'
                ? '<span class="material-symbols-outlined text-[14px] align-middle mr-1">person_remove</span>Quitar Admin'
                : '<span class="material-symbols-outlined text-[14px] align-middle mr-1">admin_panel_settings</span>Hacer Admin'}
                    </button>
                ` : '<span class="text-xs text-slate-500 italic">Tu cuenta</span>'}
            </div>
        </div>
    `).join('');

    container.innerHTML = `
        <h2 class="text-xl font-bold mb-4">Gestión de Usuarios</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            ${usersHtml}
        </div>
    `;
}

async function toggleUserStatus(id, currentlyActive) {
    const word = currentlyActive ? 'suspender' : 'activar';
    const ok = await showConfirm(`¿Estás seguro de ${word} este usuario?`);
    if (!ok) return;

    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_URL}/users/${id}/toggle-status`, {
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
        const res = await fetch(`${API_URL}/users/${id}/change-role`, {
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
