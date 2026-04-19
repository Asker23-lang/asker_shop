// Chatbot Widget
class ChatBot {
  constructor() {
    this.isOpen = false;
    this.messages = [];
    this.isListening = false;
    this.speechSynthesis = window.speechSynthesis;
    this.speechRecognition = null;
    this.init();
  }

  init() {
    console.log('Chatbot init started');
    this.createChatWidget();
    console.log('Widget created');
    this.attachEventListeners();
    console.log('Event listeners attached');
    this.loadWelcomeMessage();
    console.log('Welcome message loaded');
  }

  createChatWidget() {
    // Создаём контейнер для чата
    const chatContainer = document.createElement('div');
    chatContainer.id = 'chatbot-widget';
    chatContainer.className = 'chatbot-widget';
    chatContainer.innerHTML = `
      <div class="chatbot-header">
        <div class="chatbot-header-title">
          <span class="chatbot-icon">💬</span>
          <span>KENDRICK Assistant</span>
        </div>
        <button class="chatbot-close-btn" aria-label="Close chat">×</button>
      </div>
      <div class="chatbot-messages" id="chatbot-messages"></div>
      <div class="chatbot-input-area">
        <input 
          type="text" 
          id="chatbot-input" 
          class="chatbot-input" 
          placeholder="Напишите вопрос..."
          autocomplete="off"
        >
        <button class="chatbot-voice-btn" id="chatbot-voice-btn" aria-label="Voice input" title="Голосовой ввод">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
            <path d="M19 10v1a7 7 0 0 1-14 0v-1"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
          </svg>
        </button>
        <button class="chatbot-send-btn" aria-label="Send message">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
    `;

    // Создаём кнопку для открытия чата
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'chatbot-toggle';
    toggleBtn.className = 'chatbot-toggle';
    toggleBtn.innerHTML = '💬';
    toggleBtn.setAttribute('aria-label', 'Open chat');
    toggleBtn.title = 'Chat with us!';

    document.body.appendChild(chatContainer);
    document.body.appendChild(toggleBtn);
  }

  attachEventListeners() {
    const toggleBtn = document.getElementById('chatbot-toggle');
    const closeBtn = document.querySelector('.chatbot-close-btn');
    const sendBtn = document.querySelector('.chatbot-send-btn');
    const voiceBtn = document.getElementById('chatbot-voice-btn');
    const input = document.getElementById('chatbot-input');

    toggleBtn.addEventListener('click', () => this.toggle());
    closeBtn.addEventListener('click', () => this.close());
    sendBtn.addEventListener('click', () => this.sendMessage());
    voiceBtn.addEventListener('click', () => this.toggleVoiceInput());
    
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.sendMessage();
      }
    });
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    const widget = document.getElementById('chatbot-widget');
    const toggleBtn = document.getElementById('chatbot-toggle');
    
    widget.classList.add('active');
    toggleBtn.classList.add('hidden');
    this.isOpen = true;
    
    // Фокус на input
    setTimeout(() => {
      document.getElementById('chatbot-input').focus();
    }, 300);
  }

  close() {
    const widget = document.getElementById('chatbot-widget');
    const toggleBtn = document.getElementById('chatbot-toggle');
    
    widget.classList.remove('active');
    toggleBtn.classList.remove('hidden');
    this.isOpen = false;
  }

  initVoiceFeatures() {
    // Проверяем поддержку Speech Recognition
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.speechRecognition = new SpeechRecognition();
      this.speechRecognition.continuous = false;
      this.speechRecognition.interimResults = false;
      this.speechRecognition.lang = 'ru-RU'; // Русский язык
      
      this.speechRecognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        document.getElementById('chatbot-input').value = transcript;
        this.sendMessage();
      };
      
      this.speechRecognition.onend = () => {
        this.stopListening();
      };
      
      this.speechRecognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        this.stopListening();
        this.addMessage('Извините, не удалось распознать речь. Попробуйте ввести текстом.', 'bot');
      };
    } else {
      // Если не поддерживается, скрываем кнопку голоса
      const voiceBtn = document.getElementById('chatbot-voice-btn');
      if (voiceBtn) {
        voiceBtn.style.display = 'none';
      }
    }
  }

  loadWelcomeMessage() {
    // Добавляем приветственное сообщение
    setTimeout(() => {
      const welcomeText = 'Здравствуйте! 👋 Это KENDRICK Assistant. Чем я могу вам помочь? Спросите о доставке, оплате, размерах или изделиях.';
      this.addMessage(welcomeText, 'bot');
      this.speakMessage(welcomeText);
    }, 500);
  }

  addMessage(text, sender = 'user') {
    const messagesContainer = document.getElementById('chatbot-messages');
    const messageEl = document.createElement('div');
    messageEl.className = `chatbot-message ${sender}`;
    messageEl.innerHTML = `<div class="chatbot-message-text">${this.escapeHtml(text)}</div>`;
    
    messagesContainer.appendChild(messageEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    this.messages.push({ text, sender, timestamp: new Date() });
  }

  async sendMessage() {
    const input = document.getElementById('chatbot-input');
    const message = input.value.trim();
    
    if (!message) return;
    
    // Добавляем сообщение пользователя
    this.addMessage(message, 'user');
    input.value = '';

    // Добавляем индикатор печати
    this.showTypingIndicator();

    try {
      const response = await fetch('/api/chatbot/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message })
      });

      this.removeTypingIndicator();

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data = await response.json();
      
      // Добавляем ответ бота с небольшой задержкой
      setTimeout(() => {
        this.addMessage(data.message, 'bot');
        // Озвучиваем ответ
        this.speakMessage(data.message);
      }, 300);

    } catch (error) {
      this.removeTypingIndicator();
      console.error('Error:', error);
      this.addMessage(
        'Извините, произошла ошибка. Пожалуйста, попробуйте позже или свяжитесь с поддержкой.',
        'bot'
      );
    }
  }

  showTypingIndicator() {
    const messagesContainer = document.getElementById('chatbot-messages');
    const indicator = document.createElement('div');
    indicator.className = 'chatbot-message bot typing-indicator';
    indicator.id = 'typing-indicator';
    indicator.innerHTML = `
      <div class="chatbot-message-text">
        <span></span><span></span><span></span>
      </div>
    `;
    messagesContainer.appendChild(indicator);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  toggleVoiceInput() {
    if (this.isListening) {
      this.stopListening();
    } else {
      this.startListening();
    }
  }

  startListening() {
    if (!this.speechRecognition) return;
    
    try {
      this.speechRecognition.start();
      this.isListening = true;
      this.updateVoiceButton(true);
      this.addMessage('🎤 Слушаю... Говорите ваш вопрос', 'bot');
    } catch (error) {
      console.error('Error starting speech recognition:', error);
      this.addMessage('Не удалось запустить распознавание речи.', 'bot');
    }
  }

  stopListening() {
    if (this.speechRecognition && this.isListening) {
      this.speechRecognition.stop();
      this.isListening = false;
      this.updateVoiceButton(false);
    }
  }

  updateVoiceButton(isListening) {
    const voiceBtn = document.getElementById('chatbot-voice-btn');
    if (voiceBtn) {
      if (isListening) {
        voiceBtn.classList.add('listening');
        voiceBtn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
            <path d="M19 10v1a7 7 0 0 1-14 0v-1"></path>
          </svg>
        `;
      } else {
        voiceBtn.classList.remove('listening');
        voiceBtn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
            <path d="M19 10v1a7 7 0 0 1-14 0v-1"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
          </svg>
        `;
      }
    }
  }

  speakMessage(text) {
    if (!this.speechSynthesis) return;
    
    // Останавливаем предыдущую речь
    this.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ru-RU'; // Русский язык
    utterance.rate = 0.9; // Немного медленнее
    utterance.pitch = 1;
    
    this.speechSynthesis.speak(utterance);
  }
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }
}

// Инициализируем чат-бот когда загрузится DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    try {
      new ChatBot();
    } catch (error) {
      console.error('Error initializing chatbot:', error);
    }
  });
} else {
  try {
    new ChatBot();
  } catch (error) {
    console.error('Error initializing chatbot:', error);
  }
}
