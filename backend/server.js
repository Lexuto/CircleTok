import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { Telegraf } from 'telegraf';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ============ БАЗА ДАННЫХ ============
let db;
async function initDB() {
    db = await open({ filename: './circles.db', driver: sqlite3.Database });
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telegram_id TEXT UNIQUE,
            username TEXT,
            first_name TEXT
        );
        CREATE TABLE IF NOT EXISTS videos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id TEXT,
            message_id TEXT,
            user_telegram_id TEXT,
            status TEXT DEFAULT 'pending',
            likes_count INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
    console.log('✅ База данных готова');
}

// ============ БОТ ДЛЯ МОДЕРАЦИИ ============
const bot = new Telegraf(process.env.BOT_TOKEN);
const MODERATOR_ID = process.env.MODERATOR_ID;
const CHANNEL_PENDING = '@CircleTokpending';
const CHANNEL_APPROVED = '@CircleTokapproved';
const CHANNEL_ADULT = '@CircleTokadult';

// Функция отправки видео на модерацию с КНОПКАМИ
async function sendToModeration(videoBuffer, userId, username, videoId) {
    try {
        console.log(`📹 Отправляем видео #${videoId} от @${username}`);
        
        // 1. Отправляем видео в канал модерации
        const videoMessage = await bot.telegram.sendVideoNote(
            CHANNEL_PENDING,
            { source: videoBuffer },
            { duration: 60, length: 640 }
        );
        
        const fileId = videoMessage.video_note.file_id;
        const messageId = videoMessage.message_id;
        
        // 2. Сохраняем file_id и message_id в БД
        await db.run(
            'UPDATE videos SET file_id = ?, message_id = ? WHERE id = ?',
            [fileId, messageId.toString(), videoId]
        );
        
        // 3. Отправляем информацию о пользователе в канал
        await bot.telegram.sendMessage(
            CHANNEL_PENDING,
            `👤 Пользователь: @${username}\n🆔 ID: ${userId}\n🎬 Видео #${videoId}\n📅 ${new Date().toLocaleString()}`
        );
        
        // 4. Отправляем МОДЕРАТОРУ сообщение с КНОПКАМИ
        const keyboard = {
            inline_keyboard: [
                [
                    { text: "✅ ОДОБРИТЬ", callback_data: `approve_${videoId}` },
                    { text: "🔞 18+", callback_data: `adult_${videoId}` }
                ],
                [
                    { text: "❌ ОТКЛОНИТЬ", callback_data: `reject_${videoId}` }
                ]
            ]
        };
        
        await bot.telegram.sendMessage(
            MODERATOR_ID,
            `📹 НОВОЕ ВИДЕО НА МОДЕРАЦИЮ!\n\n` +
            `👤 От: @${username}\n` +
            `🆔 ID видео: ${videoId}\n` +
            `📅 ${new Date().toLocaleString()}\n\n` +
            `👇 Нажми на кнопку:`,
            { reply_markup: keyboard }
        );
        
        console.log(`✅ Видео #${videoId} отправлено на модерацию, кнопки отправлены модератору`);
        return fileId;
        
    } catch (error) {
        console.error('❌ Ошибка sendToModeration:', error);
        throw error;
    }
}

// ============ API ENDPOINTS ============

// Регистрация пользователя
app.post('/api/user', async (req, res) => {
    try {
        const { telegram_id, username, first_name } = req.body;
        await db.run(
            'INSERT OR IGNORE INTO users (telegram_id, username, first_name) VALUES (?, ?, ?)',
            [telegram_id, username, first_name]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Загрузка видео
app.post('/api/upload', upload.single('video'), async (req, res) => {
    try {
        const { user_telegram_id } = req.body;
        const videoBuffer = req.file.buffer;
        
        // Получаем пользователя
        const user = await db.get('SELECT username FROM users WHERE telegram_id = ?', [user_telegram_id]);
        const username = user?.username || 'unknown';
        
        // Создаём запись в БД
        const result = await db.run(
            'INSERT INTO videos (user_telegram_id, status) VALUES (?, ?)',
            [user_telegram_id, 'pending']
        );
        const videoId = result.lastID;
        
        // Отправляем на модерацию (сюда же отправляются кнопки модератору)
        await sendToModeration(videoBuffer, user_telegram_id, username, videoId);
        
        res.json({ success: true, video_id: videoId, message: 'Видео отправлено на модерацию' });
        
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Получить ленту
app.get('/api/feed', async (req, res) => {
    try {
        const adult = req.query.adult === 'true';
        const statusFilter = adult ? 'adult' : 'approved';
        
        const videos = await db.all(`
            SELECT v.*, u.username, u.first_name 
            FROM videos v 
            JOIN users u ON u.telegram_id = v.user_telegram_id 
            WHERE v.status = ?
            ORDER BY v.created_at DESC 
            LIMIT 50
        `, [statusFilter]);
        
        res.json(videos);
    } catch (error) {
        console.error('Feed error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Получить видео на модерации (для команды /pending)
app.get('/api/pending', async (req, res) => {
    try {
        const videos = await db.all(`
            SELECT v.*, u.username 
            FROM videos v 
            JOIN users u ON u.telegram_id = v.user_telegram_id 
            WHERE v.status = 'pending'
            ORDER BY v.created_at DESC
        `);
        res.json(videos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Модерация (обновление статуса)
app.post('/api/moderate', async (req, res) => {
    try {
        const { video_id, status } = req.body;
        
        // Получаем информацию о видео
        const video = await db.get('SELECT * FROM videos WHERE id = ?', [video_id]);
        
        if (!video) {
            return res.status(404).json({ error: 'Видео не найдено' });
        }
        
        // Обновляем статус
        await db.run('UPDATE videos SET status = ? WHERE id = ?', [status, video_id]);
        
        // Если одобрено - копируем в канал одобренных
        if (status === 'approved') {
            try {
                await bot.telegram.copyMessage(
                    CHANNEL_APPROVED,
                    CHANNEL_PENDING,
                    parseInt(video.message_id)
                );
                console.log(`✅ Видео #${video_id} скопировано в ${CHANNEL_APPROVED}`);
            } catch (err) {
                console.error('Ошибка копирования:', err);
            }
        }
        
        // Если 18+ - копируем в канал 18+
        if (status === 'adult') {
            try {
                await bot.telegram.copyMessage(
                    CHANNEL_ADULT,
                    CHANNEL_PENDING,
                    parseInt(video.message_id)
                );
                console.log(`🔞 Видео #${video_id} скопировано в ${CHANNEL_ADULT}`);
            } catch (err) {
                console.error('Ошибка копирования:', err);
            }
        }
        
        // Если отклонено - удаляем из канала
        if (status === 'rejected') {
            try {
                await bot.telegram.deleteMessage(CHANNEL_PENDING, parseInt(video.message_id));
                console.log(`❌ Видео #${video_id} удалено из канала`);
            } catch (err) {
                console.error('Ошибка удаления:', err);
            }
        }
        
        console.log(`📝 Видео #${video_id} → ${status}`);
        res.json({ success: true });
        
    } catch (error) {
        console.error('Moderate error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ ЗАПУСК ============
async function start() {
    await initDB();
    
    console.log('\n📋 ПРОВЕРКА НАСТРОЕК:');
    console.log(`🤖 BOT_TOKEN: ${process.env.BOT_TOKEN ? '✅' : '❌'}`);
    console log(`👤 MODERATOR_ID: ${MODERATOR_ID || '❌'}`);
    console.log(`📢 CHANNEL_PENDING: ${CHANNEL_PENDING}`);
    console.log(`✅ CHANNEL_APPROVED: ${CHANNEL_APPROVED}`);
    console.log(`🔞 CHANNEL_ADULT: ${CHANNEL_ADULT}`);
    
    app.listen(PORT, () => {
        console.log(`\n🚀 Сервер запущен на порту ${PORT}`);
        console.log(`📱 Mini App: https://circletok.onrender.com`);
    });
}

start();
