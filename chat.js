document.addEventListener('DOMContentLoaded', () => {
    const chatToggle = document.getElementById('chatToggle');
    const chatWindow = document.getElementById('chatWindow');
    const closeChat = document.getElementById('closeChat');
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const sendMessage = document.getElementById('sendMessage');
    const typingIndicator = document.getElementById('typingIndicator');

    // URL DE PRODUCCIÓN DE N8N (Ya configurada)
    const N8N_WEBHOOK_URL = 'https://damiannndiazz.app.n8n.cloud/webhook/chat';

    // Toggle Chat
    chatToggle.addEventListener('click', () => {
        chatWindow.classList.toggle('active');
        if (chatWindow.classList.contains('active')) {
            chatInput.focus();
        }
    });

    closeChat.addEventListener('click', () => {
        chatWindow.classList.remove('active');
    });

    // Send Message Logic
    function addMessage(text, sender) {
        const div = document.createElement('div');
        div.classList.add('message', sender);
        div.textContent = text;
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    async function handleSend() {
        const text = chatInput.value.trim();
        if (!text) return;

        // Add user message
        addMessage(text, 'user');
        chatInput.value = '';

        // Show typing indicator
        typingIndicator.style.display = 'block';
        chatMessages.scrollTop = chatMessages.scrollHeight;

        try {
            const response = await fetch(N8N_WEBHOOK_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message: text })
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
                addMessage('Respuesta recibida (ver consola)', 'bot');
            }

        } catch (error) {
            console.error('Error sending message:', error);
            typingIndicator.style.display = 'none';
            addMessage('Error: No pude conectar con el servidor (¿Está encendido el n8n?).', 'bot');
        }
    }

    sendMessage.addEventListener('click', handleSend);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSend();
    });
});
