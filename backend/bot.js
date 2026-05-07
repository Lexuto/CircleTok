import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const MODERATOR_ID = process.env.MODERATOR_ID;
// Используем локальный адрес, так как бот и API на одном сервере
const API_URL = process.env.API_URL || 'http://localhost:3000';

if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN не найден');
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Команда /start
bot.start(async (ctx) => {
    const user = ctx.from;
    
    // Регистрируем пользователя
    try {
        await fetch(`${API_URL}/api/user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                telegram_id: user.id.toString(),
                username: user.username || `user_${user.id}`,
                first_name: user.first_name || 'Аноним'
            })
        });
        console.log(`✅ Зарегистрирован: ${user.first_name}`);
    } catch (error) {
        console.error('Reg error:', error.message);
    }
    
    await ctx.reply(
        `🎬 Добро пожаловать в CircleTok, ${user.first_name}!\n\n` +
        `📹 Создавай кружки до 60 секунд\n` +
        `❤️ Ставь лайки\n` +
        `🔞 Есть раздел 18+\n\n` +
        `👇 Нажми на кнопку ниже, чтобы открыть приложение`,
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "📱 Открыть CircleTok", web_app: { url: "https://circletok.onrender.com" } }]
                ]
            }
        }
    );
});

// Обработчик одобрения видео
bot.action(/approve_(.+)/, async (ctx) => {
    const videoId = ctx.match[1];
    const userId = ctx.from.id.toString();
    
    console.log(`📹 Попытка одобрить видео ${videoId} от пользователя ${userId}`);
    
    // Проверяем, что это модератор
    if (userId !== MODERATOR_ID) {
        console.log(`❌ Отказано: пользователь ${userId} не модератор`);
        return ctx.answerCbQuery('⛔ У вас нет прав модератора');
    }
    
    try {
        console.log(`📡 Отправка запроса к ${API_URL}/api/moderate`);
        
        const response = await fetch(`${API_URL}/api/moderate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ video_id: parseInt(videoId), status: 'approved' })
        });
        
        const data = await response.json();
        console.log(`📡 Ответ сервера:`, data);
        
        if (response.ok) {
            await ctx.answerCbQuery('✅ Видео одобрено!');
            await ctx.editMessageText(
                ctx.update.callback_query.message.text + '\n\n✅ ОДОБРЕНО В ОБЩУЮ ЛЕНТУ'
            );
            console.log(`✅ Видео ${videoId} одобрено`);
        } else {
            await ctx.answerCbQuery(`❌ Ошибка: ${data.error || 'неизвестная'}`);
        }
    } catch (error) {
        console.error('❌ Approve error:', error.message);
        await ctx.answerCbQuery('❌ Ошибка соединения с сервером');
    }
});

// Обработчик отправки в 18+
bot.action(/adult_(.+)/, async (ctx) => {
    const videoId = ctx.match[1];
    const userId = ctx.from.id.toString();
    
    console.log(`🔞 Попытка отправить в 18+ видео ${videoId}`);
    
    if (userId !== MODERATOR_ID) {
        return ctx.answerCbQuery('⛔ У вас нет прав модератора');
    }
    
    try {
        const response = await fetch(`${API_URL}/api/moderate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ video_id: parseInt(videoId), status: 'adult' })
        });
        
        if (response.ok) {
            await ctx.answerCbQuery('🔞 Видео отправлено в 18+');
            await ctx.editMessageText(
                ctx.update.callback_query.message.text + '\n\n🔞 ОТПРАВЛЕНО В 18+'
            );
            console.log(`🔞 Видео ${videoId} отправлено в 18+`);
        } else {
            await ctx.answerCbQuery('❌ Ошибка при отправке');
        }
    } catch (error) {
        console.error('Adult error:', error.message);
        await ctx.answerCbQuery('❌ Ошибка соединения');
    }
});

// Обработчик отклонения видео
bot.action(/reject_(.+)/, async (ctx) => {
    const videoId = ctx.match[1];
    const userId = ctx.from.id.toString();
    
    console.log(`❌ Попытка отклонить видео ${videoId}`);
    
    if (userId !== MODERATOR_ID) {
        return ctx.answerCbQuery('⛔ У вас нет прав модератора');
    }
    
    try {
        const response = await fetch(`${API_URL}/api/moderate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ video_id: parseInt(videoId), status: 'rejected' })
        });
        
        if (response.ok) {
            await ctx.answerCbQuery('❌ Видео отклонено');
            await ctx.editMessageText(
                ctx.update.callback_query.message.text + '\n\n❌ ОТКЛОНЕНО'
            );
            console.log(`❌ Видео ${videoId} отклонено`);
        } else {
            await ctx.answerCbQuery('❌ Ошибка при отклонении');
        }
    } catch (error) {
        console.error('Reject error:', error.message);
        await ctx.answerCbQuery('❌ Ошибка соединения');
    }
});

// Команда для проверки
bot.command('moderate', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (userId !== MODERATOR_ID) {
        return ctx.reply('⛔ У вас нет доступа к модерации');
    }
    
    await ctx.reply(
        '🛠 Панель модератора активна\n\n' +
        `API URL: ${API_URL}\n` +
        `Модератор ID: ${MODERATOR_ID}\n\n` +
        'Когда пользователи загружают видео, они приходят в этот чат.\n' +
        'Нажми на кнопки под видео, чтобы:\n' +
        '✅ - одобрить в общую ленту\n' +
        '🔞 - отправить в раздел 18+\n' +
        '❌ - отклонить видео'
    );
});

// Запуск
bot.telegram.deleteWebhook().then(() => {
    console.log('✅ Webhook удалён');
    bot.launch();
    console.log('🤖 Бот CircleTok запущен!');
    console.log(`📝 Модератор: ${MODERATOR_ID}`);
    console.log(`🔗 API URL: ${API_URL}`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
