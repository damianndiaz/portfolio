document.addEventListener('DOMContentLoaded', () => {
    const chatToggle = document.getElementById('chatToggle');
    const chatWindow = document.getElementById('chatWindow');
    const closeChat = document.getElementById('closeChat');
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const sendMessage = document.getElementById('sendMessage');
    const typingIndicator = document.getElementById('typingIndicator');

    // URL DE PRODUCCIÓN DE N8N
    const N8N_WEBHOOK_URL = 'https://damiannndiazz.app.n8n.cloud/webhook/chat';

    // Suggestion Chips Data
    const suggestions = [
        { text: "📅 Agendar Reunión", value: "Quiero agendar una reunión" },
        { text: "💻 Ver Tech Stack", value: "¿Cuál es tu stack tecnológico?" },
        { text: "📄 Descargar CV", value: "¿Me puedes pasar el CV?" },
        { text: "🤖 ¿Cómo funcionas?", value: "Explícame cómo funcionas técnicamente" }
    ];

    let chipsContainer = null;

    // Toggle Chat
    chatToggle.addEventListener('click', () => {
        chatWindow.classList.toggle('active');
        if (chatWindow.classList.contains('active')) {
            chatInput.focus();
            // Render suggestions if this is the first opening (only default bot msg exists)
            // or if we want to show them effectively as a "menu" every time it opens empty state
            if (!chipsContainer && chatMessages.children.length <= 1) {
                renderSuggestions();
            }
        }
    });

    closeChat.addEventListener('click', () => {
        chatWindow.classList.remove('active');
    });

    function renderSuggestions() {
        if (chipsContainer) return;

        chipsContainer = document.createElement('div');
        chipsContainer.classList.add('suggestion-chips');

        suggestions.forEach(suggestion => {
            const chip = document.createElement('div');
            chip.classList.add('chip');
            chip.textContent = suggestion.text;
            chip.addEventListener('click', () => {
                handleSend(suggestion.value);
            });
            chipsContainer.appendChild(chip);
        });

        chatMessages.appendChild(chipsContainer);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Send Message Logic
    function addMessage(text, sender) {
        const div = document.createElement('div');
        div.classList.add('message', sender);
        div.textContent = text;

        // If chips exist, we insert before them? Or just append?
        // Actually, if we are adding a message, we essentially cleared chips in handleSend.
        // But if the BOT adds a message, we might theoretically want chips to stay?
        // No, in this simple version, any interaction clears the initial menu.

        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    async function handleSend(manualText = null) {
        const text = manualText || chatInput.value.trim();
        if (!text) return;

        // Remove chips if they exist, as conversation has started
        if (chipsContainer) {
            chipsContainer.remove();
            chipsContainer = null;
        }

        // Add user message
        addMessage(text, 'user');
        chatInput.value = '';

        // Show typing indicator
        typingIndicator.style.display = 'block';
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // Generate or retrieve Session ID for Memory
        let sessionId = localStorage.getItem('chat_session_id');
        if (!sessionId) {
            sessionId = 'sess_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('chat_session_id', sessionId);
        }

        try {
            const response = await fetch(N8N_WEBHOOK_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: text,
                    sessionId: sessionId
                })
            });

            const data = await response.json();

            // Hide typing indicator
            typingIndicator.style.display = 'none';

            if (data.reply) {
                // Fix: Handle cases where reply might be an object to avoid [object Object]
                let replyText = data.reply;
                if (typeof data.reply === 'object') {
                    // Try to find a text property or stringify as fallback
                    replyText = data.reply.text || data.reply.content || JSON.stringify(data.reply);
                }
                addMessage(replyText, 'bot');
            } else if (data.text) {
                addMessage(data.text, 'bot');
            } else {
                // Debug: Log full data if format is unexpected
                console.log('Unexpected response:', data);
                // Si la respuesta está vacía pero fue exitosa, no mostramos error,
                // pero si n8n manda algo raro, lo mostramos.
                if (Object.keys(data).length > 0) {
                    addMessage(JSON.stringify(data), 'bot');
                } else {
                    addMessage('...', 'bot');
                }
            }

        } catch (error) {
            console.error('Error sending message:', error);
            typingIndicator.style.display = 'none';
            addMessage('Error: No pude conectar con el servidor (¿Está encendido el n8n?).', 'bot');
        }
    }

    sendMessage.addEventListener('click', () => handleSend());
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSend();
    });
});
