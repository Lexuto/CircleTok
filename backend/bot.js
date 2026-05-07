import { Telegraf, Markup } from 'telegraf';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// ============ НАСТРОЙКИ ============
const BOT_TOKEN = process.env.BOT_TOKEN;
const MODERATOR_ID = parseInt(process.env.MODERATOR_ID); // ТВОЙ ID

if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN не найден! Добавь в .env');
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// ============ БАЗА ДАННЫХ ============
let db;
async function initDB() {
    db = await open({ 
        filename: './circles.db', 
        driver: sqlite3.Database 
    });
    
    await db.exec(`
        CREATE TABLE IF NOT EXISTS videos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id TEXT,
            user_id INTEGER,
            username TEXT,
            status TEXT DEFAULT 'pending',
            views INTEGER DEFAULT 0,
            likes INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telegram_id INTEGER UNIQUE,
            username TEXT
        )
    `);
    
    console.log('✅ База данных готова');
}

// ============ КОМАНДЫ ============

// Старт
bot.start(async (ctx) => {
    const user = ctx.from;
    
    // Сохраняем пользователя
    await db.run(
        'INSERT OR IGNORE INTO users (telegram_id, username) VALUES (?, ?)',
        [user.id, user.username || 'unknown']
    );
    
    const keyboard = Markup.keyboard([
        ['📹 Лента', '🎬 Загрузить кружок'],
        ['⭐ Избранное', '👤 Профиль'],
        ['🔞 18+ Лента']
    ]).resize();
    
    await ctx.reply(
        `🎬 Добро пожаложить в CircleTok, ${user.first_name}!\n\n` +
        `📹 Создавай кружки до 60 секунд\n` +
        `❤️ Ставь лайки\n` +
        `🔞 Есть раздел 18+\n\n` +
        `👇 Используй кнопки ниже:`,
        keyboard
    );
});

// Загрузить кружок
bot.hears('🎬 Загрузить кружок', async (ctx) => {
    await ctx.reply(
        `📹 Отправь мне кружок (видео до 60 секунд):\n\n` +
        `⚠️ Как отправить кружок:\n` +
        `1. Нажми 📎 (скрепка)\n` +
        `2. Выбери 📹 Кружок\n` +
        `3. Запиши или выбери видео\n` +
        `4. Отправь мне!`
    );
});

// Обработка кружка
bot.on('video_note', async (ctx) => {
    const user = ctx.from;
    const videoNote = ctx.message.video_note;
    
    // Проверяем длительность
    if (videoNote.duration > 60) {
        return ctx.reply('❌ Кружок слишком длинный! Максимум 60 секунд.');
    }
    
    const fileId = videoNote.file_id;
    
    // Сохраняем в БД
    const result = await db.run(
        'INSERT INTO videos (file_id, user_id, username, status) VALUES (?, ?, ?, ?)',
        [fileId, user.id, user.username || 'unknown', 'pending']
    );
    
    const videoId = result.lastID;
    
    // Отправляем модератору на проверку
    if (MODERATOR_ID) {
        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('✅ Одобрить', `approve_${videoId}`),
                Markup.button.callback('🔞 18+', `adult_${videoId}`)
            ],
            [Markup.button.callback('❌ Отклонить', `reject_${videoId}`)]
        ]);
        
        await bot.telegram.sendVideoNote(MODERATOR_ID, fileId);
        await bot.telegram.sendMessage(
            MODERATOR_ID,
            `📹 НОВОЕ ВИДЕО!\n\n👤 От: @${user.username || user.id}\n🆔 ID: ${videoId}\n📅 ${new Date().toLocaleString()}`,
            keyboard
        );
        
        await ctx.reply('✅ Видео отправлено на модерацию! Ожидай одобрения.');
    } else {
        // Если модератор не задан - сразу одобряем
        await db.run('UPDATE videos SET status = "approved" WHERE id = ?', [videoId]);
        await ctx.reply('✅ Видео опубликовано!');
    }
});

// Обработка обычного видео
bot.on('video', async (ctx) => {
    await ctx.reply('❌ Пожалуйста, отправь КРУЖОК (видео с круглой рамкой). Нажми на скрепку → Кружок');
});

// Лента
bot.hears('📹 Лента', async (ctx) => {
    await showFeed(ctx, 'approved');
});

// 18+ Лента
bot.hears('🔞 18+ Лента', async (ctx) => {
    // Проверяем возраст
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ Мне есть 18', 'confirm_adult')],
        [Markup.button.callback('❌ Нет, мне нет 18', 'decline_adult')]
    ]);
    
    await ctx.reply('🔞 Вам есть 18 лет?', keyboard);
});

bot.action('confirm_adult', async (ctx) => {
    await ctx.answerCbQuery();
    await showFeed(ctx, 'adult');
});

bot.action('decline_adult', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('❌ Доступ запрещён. Этот раздел только для взрослых.');
});

// Показать ленту
async function showFeed(ctx, status) {
    const videos = await db.all(
        'SELECT * FROM videos WHERE status = ? ORDER BY created_at DESC LIMIT 20',
        [status]
    );
    
    if (videos.length === 0) {
        return ctx.reply('📭 Пока нет видео. Стань первым! Нажми "🎬 Загрузить кружок"');
    }
    
    for (const video of videos) {
        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback(`❤️ ${video.likes || 0}`, `like_${video.id}`),
                Markup.button.callback('⭐ В избранное', `save_${video.id}`)
            ]
        ]);
        
        await ctx.replyWithVideoNote(video.file_id);
        await ctx.reply(
            `📹 Видео #${video.id}\n👤 От: @${video.username}\n❤️ Лайков: ${video.likes || 0}\n👁 Просмотров: ${video.views || 0}`,
            keyboard
        );
    }
}

// Просмотр по ID
bot.command('view', async (ctx) => {
    const args = ctx.message.text.split(' ');
    const videoId = args[1];
    
    if (!videoId) {
        return ctx.reply('📹 Используй: /view 123');
    }
    
    const video = await db.get('SELECT * FROM videos WHERE id = ?', [videoId]);
    
    if (!video) {
        return ctx.reply('❌ Видео не найдено');
    }
    
    if (video.status === 'adult') {
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('✅ Подтвердить 18+', `confirm_adult_view_${videoId}`)]
        ]);
        return ctx.reply('🔞 Видео 18+. Подтвердите возраст:', keyboard);
    }
    
    if (video.status !== 'approved') {
        return ctx.reply('❌ Видео ещё не одобрено или отклонено');
    }
    
    // Увеличиваем просмотры
    await db.run('UPDATE videos SET views = views + 1 WHERE id = ?', [videoId]);
    
    await ctx.replyWithVideoNote(video.file_id);
    await ctx.reply(
        `📹 Видео #${video.id}\n👤 От: @${video.username}\n❤️ Лайков: ${video.likes || 0}\n👁 Просмотров: ${(video.views || 0) + 1}`
    );
});

// Просмотр по ID для 18+
bot.action(/confirm_adult_view_(.+)/, async (ctx) => {
    const videoId = ctx.match[1];
    await ctx.answerCbQuery();
    
    const video = await db.get('SELECT * FROM videos WHERE id = ?', [videoId]);
    
    if (!video) {
        return ctx.reply('❌ Видео не найдено');
    }
    
    await db.run('UPDATE videos SET views = views + 1 WHERE id = ?', [videoId]);
    
    await ctx.replyWithVideoNote(video.file_id);
    await ctx.reply(
        `📹 Видео #${video.id}\n👤 От: @${video.username}\n❤️ Лайков: ${video.likes || 0}\n👁 Просмотров: ${(video.views || 0) + 1}`
    );
});

// Лайк
bot.action(/like_(.+)/, async (ctx) => {
    const videoId = ctx.match[1];
    const userId = ctx.from.id;
    
    const video = await db.get('SELECT * FROM videos WHERE id = ?', [videoId]);
    if (!video) return ctx.answerCbQuery('❌ Видео не найдено');
    
    await db.run('UPDATE videos SET likes = likes + 1 WHERE id = ?', [videoId]);
    
    await ctx.answerCbQuery(`❤️ Лайк поставлен! Теперь ${(video.likes || 0) + 1}`);
    
    // Обновляем сообщение
    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback(`❤️ ${(video.likes || 0) + 1}`, `like_${videoId}`),
            Markup.button.callback('⭐ В избранное', `save_${videoId}`)
        ]
    ]);
    
    await ctx.editMessageReplyMarkup(keyboard.reply_markup);
});

// Сохранить в избранное
bot.action(/save_(.+)/, async (ctx) => {
    const videoId = ctx.match[1];
    const userId = ctx.from.id;
    
    // Сохраняем в отдельную таблицу
    await db.run(`
        CREATE TABLE IF NOT EXISTS favorites (
            user_id INTEGER,
            video_id INTEGER,
            PRIMARY KEY (user_id, video_id)
        )
    `);
    
    await db.run(
        'INSERT OR IGNORE INTO favorites (user_id, video_id) VALUES (?, ?)',
        [userId, videoId]
    );
    
    await ctx.answerCbQuery('⭐ Видео добавлено в избранное!');
});

// Избранное
bot.hears('⭐ Избранное', async (ctx) => {
    const userId = ctx.from.id;
    
    const favorites = await db.all(`
        SELECT v.* FROM videos v
        JOIN favorites f ON f.video_id = v.id
        WHERE f.user_id = ? AND v.status = 'approved'
        ORDER BY v.created_at DESC
    `, [userId]);
    
    if (favorites.length === 0) {
        return ctx.reply('⭐ У вас пока нет избранных видео');
    }
    
    for (const video of favorites) {
        await ctx.replyWithVideoNote(video.file_id);
        await ctx.reply(`📹 Видео #${video.id}\n👤 От: @${video.username}\n❤️ Лайков: ${video.likes || 0}`);
    }
});

// Профиль
bot.hears('👤 Профиль', async (ctx) => {
    const user = ctx.from;
    
    const myVideos = await db.all(
        'SELECT * FROM videos WHERE user_id = ? ORDER BY created_at DESC LIMIT 10',
        [user.id]
    );
    
    const totalLikes = myVideos.reduce((sum, v) => sum + (v.likes || 0), 0);
    
    let message = `👤 ТВОЙ ПРОФИЛЬ\n\n`;
    message += `🆔 ID: ${user.id}\n`;
    message += `📝 Имя: ${user.first_name}\n`;
    message += `🔗 Username: @${user.username || 'нет'}\n\n`;
    message += `📊 СТАТИСТИКА:\n`;
    message += `📹 Видео: ${myVideos.length}\n`;
    message += `❤️ Получено лайков: ${totalLikes}\n\n`;
    
    if (user.id === MODERATOR_ID) {
        message += `🛠 ТЫ МОДЕРАТОР!\n`;
        message += `Используй /pending для проверки видео\n`;
        message += `Или /stats для статистики`;
    }
    
    await ctx.reply(message);
});

// ============ МОДЕРАЦИЯ (только для модератора) ============

// Показать видео на модерации
bot.command('pending', async (ctx) => {
    if (ctx.from.id !== MODERATOR_ID) {
        return ctx.reply('⛔ У вас нет доступа к модерации');
    }
    
    const videos = await db.all(
        'SELECT * FROM videos WHERE status = "pending" ORDER BY created_at DESC'
    );
    
    if (videos.length === 0) {
        return ctx.reply('📭 Нет видео на модерации');
    }
    
    for (const video of videos) {
        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('✅ Одобрить', `approve_${video.id}`),
                Markup.button.callback('🔞 18+', `adult_${video.id}`)
            ],
            [Markup.button.callback('❌ Отклонить', `reject_${video.id}`)]
        ]);
        
        await ctx.replyWithVideoNote(video.file_id);
        await ctx.reply(
            `📹 ВИДЕО НА МОДЕРАЦИИ #${video.id}\n` +
            `👤 От: @${video.username}\n` +
            `📅 ${new Date(video.created_at).toLocaleString()}`,
            keyboard
        );
    }
});

// Обработчики модерации
bot.action(/approve_(.+)/, async (ctx) => {
    if (ctx.from.id !== MODERATOR_ID) {
        return ctx.answerCbQuery('⛔ Нет доступа');
    }
    
    const videoId = ctx.match[1];
    await db.run('UPDATE videos SET status = "approved" WHERE id = ?', [videoId]);
    
    await ctx.answerCbQuery('✅ Видео одобрено!');
    await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n✅ ОДОБРЕНО');
    
    // Уведомляем автора
    const video = await db.get('SELECT user_id FROM videos WHERE id = ?', [videoId]);
    if (video) {
        await bot.telegram.sendMessage(video.user_id, '✅ Ваше видео одобрено и опубликовано в ленте!');
    }
});

bot.action(/adult_(.+)/, async (ctx) => {
    if (ctx.from.id !== MODERATOR_ID) {
        return ctx.answerCbQuery('⛔ Нет доступа');
    }
    
    const videoId = ctx.match[1];
    await db.run('UPDATE videos SET status = "adult" WHERE id = ?', [videoId]);
    
    await ctx.answerCbQuery('🔞 Видео в 18+');
    await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n🔞 18+ РАЗДЕЛ');
    
    const video = await db.get('SELECT user_id FROM videos WHERE id = ?', [videoId]);
    if (video) {
        await bot.telegram.sendMessage(video.user_id, '🔞 Ваше видео отправлено в раздел 18+');
    }
});

bot.action(/reject_(.+)/, async (ctx) => {
    if (ctx.from.id !== MODERATOR_ID) {
        return ctx.answerCbQuery('⛔ Нет доступа');
    }
    
    const videoId = ctx.match[1];
    await db.run('UPDATE videos SET status = "rejected" WHERE id = ?', [videoId]);
    
    await ctx.answerCbQuery('❌ Видео отклонено');
    await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n❌ ОТКЛОНЕНО');
    
    const video = await db.get('SELECT user_id FROM videos WHERE id = ?', [videoId]);
    if (video) {
        await bot.telegram.sendMessage(video.user_id, '❌ Ваше видео отклонено модератором');
    }
});

// Статистика для модератора
bot.command('stats', async (ctx) => {
    if (ctx.from.id !== MODERATOR_ID) {
        return ctx.reply('⛔ Нет доступа');
    }
    
    const pending = await db.get('SELECT COUNT(*) as count FROM videos WHERE status = "pending"');
    const approved = await db.get('SELECT COUNT(*) as count FROM videos WHERE status = "approved"');
    const adult = await db.get('SELECT COUNT(*) as count FROM videos WHERE status = "adult"');
    const rejected = await db.get('SELECT COUNT(*) as count FROM videos WHERE status = "rejected"');
    const users = await db.get('SELECT COUNT(*) as count FROM users');
    
    await ctx.reply(
        `📊 СТАТИСТИКА CircleTok\n\n` +
        `👥 Пользователей: ${users.count}\n` +
        `📹 Всего видео: ${pending.count + approved.count + adult.count + rejected.count}\n\n` +
        `⏳ На модерации: ${pending.count}\n` +
        `✅ Одобрено: ${approved.count}\n` +
        `🔞 18+: ${adult.count}\n` +
        `❌ Отклонено: ${rejected.count}`
    );
});

// ============ ЗАПУСК ============
async function start() {
    await initDB();
    
    // Удаляем вебхук
    await bot.telegram.deleteWebhook();
    
    // Запускаем бота
    bot.launch();
    
    console.log('\n🤖 CircleTok БОТ ЗАПУЩЕН!');
    console.log(`👤 Модератор ID: ${MODERATOR_ID || '❌ НЕ ЗАДАН'}`);
    console.log('\n📋 КОМАНДЫ:');
    console.log('   /start - Главное меню');
    console.log('   /pending - Модерация (только для тебя)');
    console.log('   /stats - Статистика (только для тебя)');
    console.log('   /view 123 - Просмотр видео по ID');
    console.log('\n💡 Отправь мне КРУЖОК (круглое видео) - он уйдёт на модерацию!');
}

start();

// Остановка
process.once('SIGINT', () => {
    console.log('\n🛑 Бот остановлен');
    bot.stop('SIGINT');
    process.exit(0);
});
