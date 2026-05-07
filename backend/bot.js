import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const API_URL = process.env.API_URL || 'https://circletok.onrender.com';
const MODERATOR_ID = process.env.MODERATOR_ID;

console.log(`🤖 Запуск бота...`);
console.log(`👤 Модератор ID: ${MODERATOR_ID}`);

bot.start((ctx) => {
    const userId = ctx.from.id.toString();
    console.log(`📝 /start от ${userId}`);
    
    if (userId === MODERATOR_ID) {
        ctx.reply(`🎬 Привет, Модератор!\n\nТвой ID: ${userId}\n\nИспользуй /moderate для панели`);
    } else {
        ctx.reply(`🎬 Добро пожаловать в CircleTok!\n\nТвой ID: ${userId}\n\nСкоро здесь появится Mini App!`);
    }
});

// Панель модератора
bot.command('moderate', async (ctx) => {
    const userId = ctx.from.id.toString();
    
    if (userId !== MODERATOR_ID) {
        return ctx.reply(`⛔ Нет доступа!\n\nВаш ID: ${userId}\nНужен ID: ${MODERATOR_ID}`);
    }
    
    await ctx.reply(
        `🛠 ПАНЕЛЬ МОДЕРАТОРА\n\n` +
        `✅ Вы авторизованы как модератор\n\n` +
        `📹 Как работает модерация:\n` +
        `1. Пользователь загружает видео\n` +
        `2. Видео появляется в канале @CircleTokpending\n` +
        `3. Тебе сюда приходят КНОПКИ под видео\n` +
        `4. Нажми на кнопку:\n` +
        `   ✅ - в общую ленту\n` +
        `   🔞 - в раздел 18+\n` +
        `   ❌ - отклонить\n\n` +
        `⚠️ Если кнопки НЕ приходят — проверь что бот админ в канале @CircleTokpending`
    );
});

// Показать видео на модерации
bot.command('pending', async (ctx) => {
    const userId = ctx.from.id.toString();
    
    if (userId !== MODERATOR_ID) {
        return ctx.reply('⛔ Нет доступа');
    }
    
    try {
        const response = await fetch(`${API_URL}/api/pending`);
        const videos = await response.json();
        
        if (videos.length === 0) {
            return ctx.reply('📭 Нет видео на модерации');
        }
        
        for (const video of videos) {
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: "✅ ОДОБРИТЬ", callback_data: `approve_${video.id}` },
                        { text: "🔞 18+", callback_data: `adult_${video.id}` }
                    ],
                    [
                        { text: "❌ ОТКЛОНИТЬ", callback_data: `reject_${video.id}` }
                    ]
                ]
            };
            
            const caption = `📹 ВИДЕО #${video.id}\n👤 От: @${video.username}\n📅 ${new Date(video.created_at).toLocaleString()}`;
            
            if (video.file_id) {
                await ctx.replyWithVideoNote(`tg://video_note?file_id=${video.file_id}`);
                await ctx.reply(caption, { reply_markup: keyboard });
            } else {
                await ctx.reply(caption + '\n\n⚠️ Видео загружается...', { reply_markup: keyboard });
            }
        }
    } catch (error) {
        console.error('Pending error:', error);
        ctx.reply('❌ Ошибка загрузки');
    }
});

// === ОБРАБОТЧИКИ КНОПОК ===
bot.action(/approve_(.+)/, async (ctx) => {
    const videoId = ctx.match[1];
    const userId = ctx.from.id.toString();
    
    console.log(`📹 Кнопка "Одобрить" от ${userId} для видео ${videoId}`);
    
    if (userId !== MODERATOR_ID) {
        return ctx.answerCbQuery(`⛔ Вы не модератор! Ваш ID: ${userId}`);
    }
    
    try {
        await fetch(`${API_URL}/api/moderate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ video_id: parseInt(videoId), status: 'approved' })
        });
        
        await ctx.answerCbQuery('✅ Видео одобрено!');
        await ctx.editMessageText(
            ctx.update.callback_query.message.text + '\n\n✅ ОДОБРЕНО В ОБЩУЮ ЛЕНТУ'
        );
        
    } catch (error) {
        console.error('Approve error:', error);
        await ctx.answerCbQuery('❌ Ошибка');
    }
});

bot.action(/adult_(.+)/, async (ctx) => {
    const videoId = ctx.match[1];
    const userId = ctx.from.id.toString();
    
    if (userId !== MODERATOR_ID) {
        return ctx.answerCbQuery('⛔ Нет прав');
    }
    
    try {
        await fetch(`${API_URL}/api/moderate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ video_id: parseInt(videoId), status: 'adult' })
        });
        
        await ctx.answerCbQuery('🔞 Видео в 18+');
        await ctx.editMessageText(
            ctx.update.callback_query.message.text + '\n\n🔞 ОТПРАВЛЕНО В 18+'
        );
        
    } catch (error) {
        console.error('Adult error:', error);
        await ctx.answerCbQuery('❌ Ошибка');
    }
});

bot.action(/reject_(.+)/, async (ctx) => {
    const videoId = ctx.match[1];
    const userId = ctx.from.id.toString();
    
    if (userId !== MODERATOR_ID) {
        return ctx.answerCbQuery('⛔ Нет прав');
    }
    
    try {
        await fetch(`${API_URL}/api/moderate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ video_id: parseInt(videoId), status: 'rejected' })
        });
        
        await ctx.answerCbQuery('❌ Видео отклонено');
        await ctx.editMessageText(
            ctx.update.callback_query.message.text + '\n\n❌ ОТКЛОНЕНО'
        );
        
    } catch (error) {
        console.error('Reject error:', error);
        await ctx.answerCbQuery('❌ Ошибка');
    }
});

// Запуск
bot.telegram.deleteWebhook().then(() => {
    console.log('✅ Webhook удалён');
    bot.launch();
    console.log('🤖 Бот запущен!');
    console.log(`👤 Модератор ID: ${MODERATOR_ID}`);
    console.log(`📢 Канал: @CircleTokpending`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
