import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN не найден в .env');
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Команда /start
bot.start(async (ctx) => {
    const user = ctx.from;
    
    console.log(`👤 Новый пользователь: ${user.first_name}`);
    
    // Пытаемся зарегистрировать через API (если сервер запущен)
    try {
        await fetch('http://localhost:3000/api/user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                telegram_id: user.id.toString(),
                username: user.username || `user_${user.id}`,
                first_name: user.first_name || 'Аноним'
            })
        });
        console.log(`✅ Пользователь ${user.id} зарегистрирован`);
    } catch (error) {
        console.log(`⚠️ Сервер API не запущен, регистрация отложена`);
    }
    
    // Простое приветствие БЕЗ кнопок
    await ctx.reply(
        `🎬 Добро пожаловать в CircleTok, ${user.first_name}!\n\n` +
        `📹 Что тут можно делать:\n` +
        `• Создавать кружки до 60 секунд\n` +
        `• Ставить лайки и добавлять в избранное\n` +
        `• Смотреть ленту видео\n` +
        `• Отдельный раздел 18+\n\n` +
        `🚀 Mini App в разработке!\n\n` +
        `ℹ️ Скоро здесь появится полный функционал.`
    );
});

// Команда /help
bot.help((ctx) => {
    ctx.reply(
        `📖 Команды CircleTok:\n\n` +
        `/start - Начать работу\n` +
        `/help - Помощь\n` +
        `/info - О проекте`
    );
});

// Команда /info
bot.command('info', (ctx) => {
    ctx.reply(
        `ℹ️ CircleTok v1.0\n\n` +
        `Социальная сеть для кружков в Telegram\n` +
        `👨‍💻 Разработчик: CircleTok Team`
    );
});

// Запуск бота
async function startBot() {
    try {
        // Удаляем вебхук
        await bot.telegram.deleteWebhook();
        console.log('✅ Webhook удалён');
        
        // Запускаем
        await bot.launch();
        
        console.log('\n🤖 Бот CircleTok ЗАПУЩЕН!');
        console.log('📝 Напиши /start в Telegram\n');
        
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
    }
}

startBot();

process.once('SIGINT', () => {
    console.log('\n🛑 Бот остановлен');
    bot.stop('SIGINT');
    process.exit(0);
});
// Обработка модерации
bot.action(/approve_(.+)/, async (ctx) => {
    const videoId = ctx.match[1];
    
    await fetch(`http://localhost:3000/api/moderate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_id: videoId, status: 'approved' })
    });
    
    await ctx.answerCbQuery('✅ Видео одобрено!');
    await ctx.editMessageText(ctx.update.callback_query.message.text + '\n\n✅ ОДОБРЕНО');
});

bot.action(/adult_(.+)/, async (ctx) => {
    const videoId = ctx.match[1];
    
    await fetch(`http://localhost:3000/api/moderate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_id: videoId, status: 'adult' })
    });
    
    await ctx.answerCbQuery('🔞 Видео в 18+');
    await ctx.editMessageText(ctx.update.callback_query.message.text + '\n\n🔞 18+');
});

bot.action(/reject_(.+)/, async (ctx) => {
    const videoId = ctx.match[1];
    
    await fetch(`http://localhost:3000/api/moderate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_id: videoId, status: 'rejected' })
    });
    
    await ctx.answerCbQuery('❌ Видео отклонено');
    await ctx.editMessageText(ctx.update.callback_query.message.text + '\n\n❌ ОТКЛОНЕНО');
});
