const express = require('express');
const router = express.Router();
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Системный промпт для чат-бота магазина
const systemPrompt = `
Ты - дружелюбный помощник интернет-магазина KENDRICK. Ты помогаешь клиентам с вопросами о товарах, доставке, оплате, возвратах и других аспектах шопинга.

Информация о магазине:
- Название: KENDRICK
- Ассортимент: Одежда (футболки, худи, джинсы, брюки, куртки, свитшоты, шорты, поло, бомберы, лонгсливы, жилеты, тренчи)
- Доставка: По всей России, стоимость 250-1000р, сроки 2-5 дней
- Оплата: Карты Visa/MasterCard, Яндекс.Касса, Apple Pay/Google Pay
- Возврат: 30 дней, товар в идеальном состоянии
- Контакты: info@kendrick.shop, +7 (495) 123-45-67

Отвечай кратко, дружелюбно и полезно. Если вопрос не связан с магазином, вежливо верни разговор к теме шопинга.
`;

// Функция для получения ответа от OpenAI
async function getChatbotResponse(message) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ],
      max_tokens: 300,
      temperature: 0.7,
    });

    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error('OpenAI API error:', error);
    // Fallback к простой базе знаний
    return findFallbackAnswer(message);
  }
}

// Простая fallback база знаний
const knowledge = {
  greetings: {
    keywords: ['привет', 'hello', 'hi', 'добрый день', 'доброе утро', 'добрый вечер'],
    response: 'Здравствуйте! 👋 Добро пожаловать в KENDRICK. Чем я могу вам помочь? Я могу рассказать о товарах, доставке, оплате или помочь с заказом.'
  },
  delivery: {
    keywords: ['доставка', 'доставлять', 'отправить', 'отправка', 'delivery', 'shipping'],
    response: '📦 О доставке: Мы доставляем по всей России. Стоимость доставки зависит от региона:\n• Москва и МО: 250-500р\n• Другие регионы: 300-1000р\nСроки: 2-5 рабочих дней'
  },
  payment: {
    keywords: ['оплата', 'платеж', 'карта', 'payment', 'pay', 'stripe'],
    response: '💳 Способы оплаты:\n• Кредитная/дебетовая карта (Visa, MasterCard)\n• Яндекс.Касса\n• Apple Pay/Google Pay\nСредства списываются после подтверждения заказа.'
  },
  sizes: {
    keywords: ['размер', 'таблица', 'size chart', 'как выбрать размер', 'какой размер'],
    response: '📏 Таблица размеров:\n• XS: 44-46\n• S: 46-48\n• M: 48-50\n• L: 50-52\n• XL: 52-54\n• XXL: 54-56\nЕсли вы не уверены, рекомендуем выбрать размер на один больше.'
  },
  return: {
    keywords: ['возврат', 'обмен', 'return', 'refund', 'не подошла'],
    response: '🔄 Политика возврата:\n• Срок: 30 дней с момента получения\n• Товар должен быть в идеальном состоянии\n• Для возврата свяжитесь с поддержкой\n• Возврат денег: 5-10 рабочих дней'
  },
  catalog: {
    keywords: ['каталог', 'товары', 'что есть', 'изделия', 'catalog', 'products'],
    response: '👕 В нашем каталоге вы найдёте:\n• Рубашки\n• Футболки\n• Свитеры\n• Брюки\n• Куртки\n• Аксессуары\n\nОткройте каталог, чтобы увидеть все товары!'
  },
  info: {
    keywords: ['информация', 'контакты', 'телефон', 'email', 'где вы', 'about'],
    response: '📞 Контакты KENDRICK:\n• Email: info@kendrick.shop\n• Телефон: +7 (495) 123-45-67\n• Работаем пн-пт: 9:00-18:00\n• Написать в чат: доступно 24/7'
  }
};

function findFallbackAnswer(message) {
  const lowerMessage = message.toLowerCase().trim();
  
  for (const [key, item] of Object.entries(knowledge)) {
    for (const keyword of item.keywords) {
      if (lowerMessage.includes(keyword)) {
        return item.response;
      }
    }
  }
  
  return 'Для этого вопроса я могу помочь:\n• Получить информацию о доставке\n• Узнать способы оплаты\n• Выбрать размер\n• Узнать о возврате\n• Просмотреть каталог\n• Получить контакты\n\nПопросите конкретный вопрос! 😊';
}

// API endpoint для чат-бота
router.post('/message', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Отправьте сообщение' });
    }
    
    const response = await getChatbotResponse(message);
    
    res.json({
      success: true,
      message: response,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Chatbot error:', error);
    res.status(500).json({ 
      error: 'Ошибка обработки сообщения. Свяжитесь с поддержкой.' 
    });
  }
});

module.exports = router;
