import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const API_URL = process.env.API_URL || 'https://circletok.onrender.com';
const MODERATOR_ID = process.env.MODERATOR_ID;

bot.start((ctx) => {
    ctx.reply(
        `🎬 CircleTok бот работает!\n\n` +
        `📹 Команды модератора:\n` +
        `/pending - Посмотреть видео на модерации\n` +
        `/moderate - Информация о модерации`
    );
});

// Команда для проверки что бот знает модератора
bot.command('moderate', async (ctx) => {
    const userId = ctx.from.id.toString();
    const moderatorId = process.env.MODERATOR_ID;
    
    console.log(`🔍 Команда /moderate от ${userId}`);
    console.log(`📝 Ожидаемый модератор: ${moderatorId}`);
    
    if (userId !== moderatorId) {
        return ctx.reply(`⛔ У вас нет доступа к модерации!\n\nВаш ID: ${userId}\nID модератора: ${moderatorId}`);
    }
    
    await ctx.reply(
        `🛠 ПАНЕЛЬ МОДЕРАТОРА\n\n` +
        `✅ Ваш ID подтверждён: ${userId}\n\n` +
        `Когда пользователи загружают видео, я присылаю тебе кнопки.\n\n` +
        `Если кнопки не приходят, проверь:\n` +
        `1. Бот добавлен в канал @CircleTokpending\n` +
        `2. У бота есть права администратора в канале\n` +
        `3. Ты написал /start этому боту`
    );
});

// Информация о модерации
bot.command('moderate', async (ctx) => {
    if (ctx.from.id.toString() !== MODERATOR_ID) {
        return ctx.reply('⛔ Нет доступа');
    }
    await ctx.reply(
        `🛠 ПАНЕЛЬ МОДЕРАТОРА\n\n` +
        `Как работает модерация:\n` +
        `1. Пользователь загружает видео\n` +
        `2. Видео появляется в канале @CircleTokpending\n` +
        `3. Тебе приходят кнопки под видео\n` +
        `4. Нажми на кнопку:\n` +
        `   ✅ - в общую ленту\n` +
        `   🔞 - в раздел 18+\n` +
        `   ❌ - отклонить\n\n` +
        `Также можешь использовать команду /pending`
    );
});

// Показать все видео на модерации
bot.command('pending', async (ctx) => {
    if (ctx.from.id.toString() !== MODERATOR_ID) {
        return ctx.reply('⛔ Нет доступа');
    }
    
    try {
        const response = await fetch(`${API_URL}/api/pending`);
        const videos = await response.json();
        
        if (videos.length === 0) {
            return ctx.reply('📭 Нет видео на модерации');
        }
        
        await ctx.reply(`📹 Найдено видео на модерации: ${videos.length}\n\nОбработай их с помощью кнопок:`);
        
        for (const video of videos) {
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: "✅ В ОБЩУЮ ЛЕНТУ", callback_data: `approve_${video.id}` },
                        { text: "🔞 В 18+", callback_data: `adult_${video.id}` }
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
        ctx.reply('❌ Ошибка загрузки списка');
    }
});

// === ОБРАБОТЧИКИ КНОПОК ===

// Одобрение в общую ленту
bot.action(/approve_(.+)/, async (ctx) => {
    const videoId = ctx.match[1];
    
    if (ctx.from.id.toString() !== MODERATOR_ID) {
        return ctx.answerCbQuery('⛔ У вас нет прав модератора');
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
        await ctx.reply(`✅ Видео #${videoId} опубликовано в общей ленте!`);
        
    } catch (error) {
        console.error('Approve error:', error);
        await ctx.answerCbQuery('❌ Ошибка');
    }
});

// Отправка в 18+
bot.action(/adult_(.+)/, async (ctx) => {
    const videoId = ctx.match[1];
    
    if (ctx.from.id.toString() !== MODERATOR_ID) {
        return ctx.answerCbQuery('⛔ У вас нет прав модератора');
    }
    
    try {
        await fetch(`${API_URL}/api/moderate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ video_id: parseInt(videoId), status: 'adult' })
        });
        
        await ctx.answerCbQuery('🔞 Видео отправлено в 18+');
        await ctx.editMessageText(
            ctx.update.callback_query.message.text + '\n\n🔞 ОТПРАВЛЕНО В 18+'
        );
        await ctx.reply(`🔞 Видео #${videoId} отправлено в раздел 18+`);
        
    } catch (error) {
        console.error('Adult error:', error);
        await ctx.answerCbQuery('❌ Ошибка');
    }
});

// Отклонение
bot.action(/reject_(.+)/, async (ctx) => {
    const videoId = ctx.match[1];
    
    if (ctx.from.id.toString() !== MODERATOR_ID) {
        return ctx.answerCbQuery('⛔ У вас нет прав модератора');
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
        await ctx.reply(`❌ Видео #${videoId} отклонено`);
        
    } catch (error) {
        console.error('Reject error:', error);
        await ctx.answerCbQuery('❌ Ошибка');
    }
});

// Запуск бота
bot.telegram.deleteWebhook().then(() => {
    console.log('✅ Webhook удалён');
    bot.launch();
    console.log('🤖 Бот запущен!');
    console.log(`👤 Модератор: ${MODERATOR_ID}`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
