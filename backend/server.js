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

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Multer
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// База данных
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
            user_telegram_id TEXT,
            status TEXT DEFAULT 'pending',
            likes_count INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
    console.log('✅ DB ready');
}

// Инициализируем бота
const bot = new Telegraf(process.env.BOT_TOKEN);

// Проверка подключения бота
bot.telegram.getMe().then((botInfo) => {
    console.log(`🤖 Бот @${botInfo.username} запущен`);
}).catch((err) => {
    console.error('❌ Ошибка подключения бота:', err.message);
});

// Функция отправки на модерацию с отладкой
async function sendToModeration(videoBuffer, userId, username, videoId) {
    try {
        console.log(`📹 Отправляем видео в канал ${process.env.CHANNEL_PENDING}`);
        
        // Проверяем, что канал существует
        const channelName = process.env.CHANNEL_PENDING;
        if (!channelName) {
            throw new Error('CHANNEL_PENDING не задан в .env');
        }
        
        // Отправляем видео как кружок
        const message = await bot.telegram.sendVideoNote(
            channelName,
            { source: videoBuffer },
            { duration: 60, length: 640 }
        );
        
        console.log(`✅ Видео отправлено, message_id: ${message.message_id}`);
        
        if (!message.video_note) {
            throw new Error('Ответ не содержит video_note');
        }
        
        const fileId = message.video_note.file_id;
        console.log(`📁 file_id получен: ${fileId}`);
        
        // Отправляем информацию о пользователе
        await bot.telegram.sendMessage(
            channelName,
            `👤 Пользователь: @${username}\n🆔 ID: ${userId}\n🎬 Видео #${videoId}\n📅 ${new Date().toLocaleString()}`
        );
        
        // Отправляем уведомление модератору
        const keyboard = {
            inline_keyboard: [
                [
                    { text: "✅ В общую ленту", callback_data: `approve_${videoId}` },
                    { text: "🔞 В 18+", callback_data: `adult_${videoId}` }
                ],
                [
                    { text: "❌ Отклонить", callback_data: `reject_${videoId}` }
                ]
            ]
        };
        
        await bot.telegram.sendMessage(
            process.env.MODERATOR_ID,
            `📹 НОВОЕ ВИДЕО НА МОДЕРАЦИЮ!\n\n👤 От: @${username}\n🆔 ID видео: ${videoId}\n📅 ${new Date().toLocaleString()}\n\n📹 Видео в канале: ${channelName}`,
            { reply_markup: keyboard }
        );
        
        console.log(`✅ Уведомление отправлено модератору`);
        
        return fileId;
        
    } catch (error) {
        console.error('❌ Ошибка в sendToModeration:', error.message);
        console.error('Полная ошибка:', error);
        throw error;
    }
}

// API endpoints
app.post('/api/user', async (req, res) => {
    try {
        const { telegram_id, username, first_name } = req.body;
        await db.run(
            'INSERT OR IGNORE INTO users (telegram_id, username, first_name) VALUES (?, ?, ?)',
            [telegram_id, username, first_name]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('User error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/upload', upload.single('video'), async (req, res) => {
    try {
        const { user_telegram_id } = req.body;
        const videoBuffer = req.file.buffer;
        
        console.log(`📹 Получено видео от ${user_telegram_id}, размер: ${videoBuffer.length} bytes`);
        
        // Получаем пользователя
        const user = await db.get('SELECT username FROM users WHERE telegram_id = ?', [user_telegram_id]);
        const username = user?.username || 'unknown';
        
        // Сохраняем в БД
        const result = await db.run('INSERT INTO videos (user_telegram_id, status) VALUES (?, ?)', [user_telegram_id, 'pending']);
        const videoId = result.lastID;
        
        console.log(`📝 Видео #${videoId} создано в БД`);
        
        // Отправляем на модерацию
        const fileId = await sendToModeration(videoBuffer, user_telegram_id, username, videoId);
        
        // Обновляем file_id
        await db.run('UPDATE videos SET file_id = ? WHERE id = ?', [fileId, videoId]);
        
        console.log(`✅ Видео #${videoId} успешно загружено, file_id: ${fileId}`);
        
        res.json({ success: true, video_id: videoId });
        
    } catch (error) {
        console.error('❌ Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/feed', async (req, res) => {
    try {
        const adult = req.query.adult === 'true';
        const videos = await db.all(`
            SELECT v.*, u.username, u.first_name 
            FROM videos v 
            JOIN users u ON u.telegram_id = v.user_telegram_id 
            WHERE v.status IN ('approved', ?)
            ORDER BY v.created_at DESC 
            LIMIT 30
        `, [adult ? 'adult' : 'approved']);
        
        res.json(videos);
    } catch (error) {
        console.error('Feed error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/moderate', async (req, res) => {
    try {
        const { video_id, status } = req.body;
        console.log(`📝 Обновление статуса видео ${video_id} -> ${status}`);
        
        await db.run('UPDATE videos SET status = ? WHERE id = ?', [status, video_id]);
        
        // Если статус approved или adult, можно отправить в соответствующий канал
        if (status === 'approved') {
            console.log(`✅ Видео ${video_id} одобрено в общую ленту`);
        } else if (status === 'adult') {
            console.log(`🔞 Видео ${video_id} отправлено в 18+`);
        } else if (status === 'rejected') {
            console.log(`❌ Видео ${video_id} отклонено`);
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Moderate error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Запуск
async function start() {
    await initDB();
    
    // Проверяем наличие необходимых переменных
    console.log('\n📋 Проверка окружения:');
    console.log(`CHANNEL_PENDING: ${process.env.CHANNEL_PENDING || '❌ не задан'}`);
    console.log(`MODERATOR_ID: ${process.env.MODERATOR_ID || '❌ не задан'}`);
    console.log(`BOT_TOKEN: ${process.env.BOT_TOKEN ? '✅ задан' : '❌ не задан'}`);
    
    if (!process.env.CHANNEL_PENDING) {
        console.error('❌ ОШИБКА: CHANNEL_PENDING не задан в .env!');
        console.log('Добавьте CHANNEL_PENDING=@CircleTokpending в переменные окружения');
    }
    
    app.listen(PORT, () => {
        console.log(`\n🚀 Сервер запущен на порту ${PORT}`);
        console.log(`📱 Mini App доступен по адресу: https://circletok.onrender.com`);
    });
}

start();
