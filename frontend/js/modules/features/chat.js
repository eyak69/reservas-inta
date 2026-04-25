// ======= MÓDULO CHAT =======
// Widget de chat con IA integrado como módulo ES6.
// Se muestra solo cuando hay sesión activa y se inicializa desde main.js.

import { API_URL } from '../core/api.js';

let isOpen = false;
let isSending = false;

export function initChat() {
    const widget = document.getElementById('chat-widget');
    if (!widget) {
        console.error('Chat Widget no encontrado en el DOM');
        return;
    }
    widget.style.setProperty('display', 'block', 'important');
    console.log('✅ Chat Asistente Inicializado');
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
    const token = localStorage.getItem('token');
    if (token) {
        fetch('/api/chat/clear', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        }).catch(() => {});
    }
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

    const token = localStorage.getItem('token');
    if (!token) {
        appendBubble('No tenés sesión activa. Por favor iniciá sesión.', 'assistant');
        return;
    }

    isSending = true;
    sendBtn.disabled = true;
    input.value = '';
    input.style.height = 'auto';

    appendBubble(message, 'user');

    const typingId = appendBubble('Escribiendo...', 'typing');

    try {
        const res = await fetch(`${API_URL}/chat/message`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ message }) // el backend maneja la memoria
        });

        removeBubble(typingId);

        if (res.status === 401 || res.status === 403) {
            appendBubble('Tu sesión expiró. Por favor iniciá sesión nuevamente.', 'assistant');
            return;
        }

        const data = await res.json();

        if (!res.ok) {
            appendBubble(data.message || 'Ocurrió un error. Intentá de nuevo.', 'assistant');
            return;
        }

        appendBubble(data.reply, 'assistant');

    } catch {
        removeBubble(typingId);
        appendBubble('No pude conectarme al servidor. Verificá tu conexión.', 'assistant');
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
