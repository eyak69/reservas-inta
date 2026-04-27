// ======= MÓDULO CHAT =======
// Widget de chat con IA integrado como módulo ES6.
// Se muestra solo cuando hay sesión activa y se inicializa desde main.js.

import { API_URL, apiFetch } from '../core/api.js';

let isOpen = false;
let isSending = false;

export function initChat() {
    const widget = document.getElementById('chat-widget');
    if (!widget) return;
    widget.style.setProperty('display', 'block', 'important');
    renderChatButton();
    console.log('✅ Chat Asistente Inicializado en Header');
}

export function renderChatButton() {
    const actions = document.getElementById('header-actions');
    if (!actions) return;
    let chatBtn = document.getElementById('btn-chat-toggle');
    if (!chatBtn) {
        chatBtn = document.createElement('button');
        chatBtn.id = 'btn-chat-toggle';
        // Diseño de "botón" real con fondo y sombra esmeralda
        chatBtn.className = 'size-10 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center text-emerald-500 shadow-lg shadow-emerald-500/5 hover:bg-emerald-500/20 transition-all active:scale-95';
        chatBtn.title = 'Asistente IA';
        chatBtn.onclick = () => toggleChat();
        const logoutBtn = actions.querySelector('button[onclick="logout()"]');
        actions.insertBefore(chatBtn, logoutBtn);
    }
    chatBtn.innerHTML = `<span class="material-symbols-outlined text-[22px]" id="chat-toggle-icon">smart_toy</span>`;
}

export function destroyChat() {
    const widget = document.getElementById('chat-widget');
    if (!widget) return;
    widget.style.display = 'none';
    isOpen = false;
    isSending = false;
    const panel = document.getElementById('chat-panel');
    const icon  = document.getElementById('chat-toggle-icon');
    if (panel) panel.classList.remove('chat-panel-open');
    if (icon)  icon.textContent = 'smart_toy';

    // Limpiar memoria en el servidor
    apiFetch(`${API_URL}/chat/clear`, { method: 'POST' }).catch(() => {});
}

export function toggleChat() {
    const panel = document.getElementById('chat-panel');
    const icon  = document.getElementById('chat-toggle-icon');
    if (!panel) return;

    isOpen = !isOpen;
    panel.classList.toggle('chat-panel-open', isOpen);
    if (icon) icon.textContent = isOpen ? 'close' : 'smart_toy';

    if (isOpen) {
        setTimeout(() => {
            const input = document.getElementById('chat-input');
            if (input) input.focus();
            scrollToBottom();
        }, 230);
    }
}

export function handleChatKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
    }
    // Autoajustar altura del textarea
    const input = e.target;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 100) + 'px';
}

export async function sendChatMessage() {
    if (isSending) return;

    const input   = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');
    const message = input?.value.trim();
    if (!message) return;

    isSending = true;
    if (sendBtn) sendBtn.disabled = true;
    if (input) {
        input.value = '';
        input.style.height = 'auto';
    }

    appendBubble(message, 'user');
    const typingId = appendBubble('Escribiendo...', 'typing');

    try {
        const res = await apiFetch(`${API_URL}/chat/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });

        removeBubble(typingId);
        const data = await res.json();

        if (!res.ok) {
            appendBubble(data.message || 'Ocurrió un error. Intentá de nuevo.', 'assistant');
            return;
        }

        // Sincronizado con data.response del backend
        appendBubble(data.response, 'assistant');

    } catch (err) {
        removeBubble(typingId);
        console.error('❌ Error crítico en Chat:', err);
        appendBubble('No pude conectar con el asistente. Por favor, reintentá.', 'assistant');
    } finally {
        isSending = false;
        if (sendBtn) sendBtn.disabled = false;
        input?.focus();
    }
}

function appendBubble(text, type) {
    const container = document.getElementById('chat-messages');
    if (!container) return null;

    const id  = `bubble-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const div = document.createElement('div');
    div.id        = id;
    div.className = `chat-bubble ${type}`;
    // Convertir saltos de línea a <br> y escapar HTML para evitar XSS
    const escaped = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    div.innerHTML = escaped.replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>');
    container.appendChild(div);
    scrollToBottom();
    return id;
}

function removeBubble(id) {
    if (!id) return;
    document.getElementById(id)?.remove();
}

function scrollToBottom() {
    const container = document.getElementById('chat-messages');
    if (container) container.scrollTop = container.scrollHeight;
}
