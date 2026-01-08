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

    // --- DATA: Suggestion Chips ---
    const MSG_AGENDAR = "Quiero agendar una reunión";
    const MSG_STACK = "¿Cuál es tu stack tecnológico?";
    const MSG_CV = "¿Me puedes pasar el CV?";
    const MSG_COMO = "Explícame cómo funcionas técnicamente";
    const MSG_LINKEDIN = "¿Tienes LinkedIn?";
    const MSG_GITHUB = "¿Cuál es tu GitHub?";

    // Default start chips
    const startSuggestions = [
        { text: "📅 Agendar Reunión", value: MSG_AGENDAR },
        { text: "💻 Ver Tech Stack", value: MSG_STACK },
        { text: "📄 Descargar CV", value: MSG_CV },
        { text: "🤖 ¿Cómo funcionas?", value: MSG_COMO }
    ];

    let currentChipsContainer = null;

    // Toggle Chat
    chatToggle.addEventListener('click', () => {
        chatWindow.classList.toggle('active');
        if (chatWindow.classList.contains('active')) {
            chatInput.focus();
            // Show start suggestions if no messages exist yet
            if (chatMessages.children.length <= 1) {
                renderSuggestions(startSuggestions);
            }
        }
    });

    closeChat.addEventListener('click', () => {
        chatWindow.classList.remove('active');
    });

    // Function to render any list of chips
    function renderSuggestions(suggestionsList) {
        // If there are existing active chips, remove them first (unlikely but safe)
        if (currentChipsContainer) {
            currentChipsContainer.remove();
        }

        const container = document.createElement('div');
        container.classList.add('suggestion-chips');

        suggestionsList.forEach(suggestion => {
            const chip = document.createElement('div');
            chip.classList.add('chip');
            chip.textContent = suggestion.text;
            chip.addEventListener('click', () => {
                handleSend(suggestion.value);
            });
            container.appendChild(chip);
        });

        chatMessages.appendChild(container);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        currentChipsContainer = container;
    }

    function addMessage(text, sender) {
        const div = document.createElement('div');
        div.classList.add('message', sender);
        div.textContent = text;
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    async function handleSend(manualText = null) {
        const text = manualText || chatInput.value.trim();
        if (!text) return;

        // 1. Remove chips immediately when user interacts
        if (currentChipsContainer) {
            currentChipsContainer.remove();
            currentChipsContainer = null;
        }

        // 2. Add User Message
        addMessage(text, 'user');
        chatInput.value = '';

        // 3. Show Typing
        typingIndicator.style.display = 'block';
        chatMessages.scrollTop = chatMessages.scrollHeight;

        let sessionId = localStorage.getItem('chat_session_id');
        if (!sessionId) {
            sessionId = 'sess_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('chat_session_id', sessionId);
        }

        try {
            const response = await fetch(N8N_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text, sessionId: sessionId })
            });
            const data = await response.json();

            // Hide typing
            typingIndicator.style.display = 'none';

            // 4. Add Bot Message
            let replyText = "";
            if (data.reply) {
                if (typeof data.reply === 'object') {
                    replyText = data.reply.text || data.reply.content || JSON.stringify(data.reply);
                } else {
                    replyText = data.reply;
                }
            } else if (data.text) {
                replyText = data.text;
            } else {
                if (Object.keys(data).length > 0) replyText = JSON.stringify(data);
                else replyText = '...';
            }
            addMessage(replyText, 'bot');

            // 5. DECIDE NEXT CHIPS (Contextual)
            // Determine logic based on what the user Last Sent (text variable)
            const nextChips = getNextChips(text);
            if (nextChips && nextChips.length > 0) {
                renderSuggestions(nextChips);
            }

        } catch (error) {
            console.error('Error sending message:', error);
            typingIndicator.style.display = 'none';
            addMessage('Error: No pude conectar con el servidor.', 'bot');
        }
    }

    // Logic to select "next" chips based on conversation context
    function getNextChips(lastUserText) {
        const lowerText = lastUserText.toLowerCase();

        // Si el usuario intentó agendar, quizás no mostramos nada o mostramos confirmaciones
        // Pero como no sabemos si el bot pidió fecha o email, mejor ofrecemos opciones "safe".
        if (lowerText.includes('agendar') || lowerText.includes('reunión')) {
            // Si está agendando, quizás quiera ver el CV mientras espera
            return [
                { text: "📄 Ver CV", value: MSG_CV },
                { text: "💻 Stack", value: MSG_STACK }
            ];
        }

        // Si preguntó por Stack, le ofrecemos Proyectos (no tenemos chip directo de proyectos, usamos GitHub/CV) o Agendar
        if (lowerText.includes('stack') || lowerText.includes('tecnología')) {
            return [
                { text: "📅 Agendar ahora", value: MSG_AGENDAR },
                { text: "🐱 Mi GitHub", value: MSG_GITHUB },
                { text: "📄 Ver CV", value: MSG_CV }
            ];
        }

        // Si pidió CV, le ofrecemos LinkedIn o Agendar
        if (lowerText.includes('cv') || lowerText.includes('curriculum')) {
            return [
                { text: "🔗 LinkedIn", value: MSG_LINKEDIN },
                { text: "📅 Agendar Entrevista", value: MSG_AGENDAR }
            ];
        }

        // Si preguntó cómo funciona, le ofrecemos ver el código o probarlo (Agendar)
        if (lowerText.includes('funciona') || lowerText.includes('técnicamente')) {
            return [
                { text: "🐱 Ir al GitHub", value: MSG_GITHUB },
                { text: "📅 Probar Agendar", value: MSG_AGENDAR }
            ];
        }

        // Default / Fallback (si escribió algo random) -> Volvemos al menú principal (o mezclado)
        return [
            { text: "📅 Agendar Reunión", value: MSG_AGENDAR },
            { text: "💻 Stack", value: MSG_STACK },
            { text: "📄 CV", value: MSG_CV }
        ];
    }

    sendMessage.addEventListener('click', () => handleSend());
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSend();
    });
});
