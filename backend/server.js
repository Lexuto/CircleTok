import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initializeDB, addUser, addVideo, updateVideoStatus, likeVideo, unlikeVideo, addToFavorites, removeFromFavorites, getFeed, getUserFavorites } from './db.js';
import { Telegraf } from 'telegraf';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Инициализируем бота для отправки в каналы
const bot = new Telegraf(process.env.BOT_TOKEN);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Настройка multer для загрузки видео
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Only video files are allowed'), false);
        }
    }
});

// Инициализация БД
await initializeDB();

// Функция отправки видео на модерацию
async function sendToModeration(videoBuffer, filename, userId, username, videoId) {
    try {
        console.log(`📹 Отправляем видео на модерацию от пользователя ${username}`);
        
        // Отправляем видео в канал модерации
        const message = await bot.telegram.sendVideoNote(
            process.env.CHANNEL_PENDING,
            { source: videoBuffer },
            {
                duration: 60,
                length: 640
            }
        );
        
        // Отправляем информацию о пользователе
        await bot.telegram.sendMessage(
            process.env.CHANNEL_PENDING,
            `👤 Пользователь: @${username}\n🆔 ID: ${userId}\n🎬 Видео #${videoId}\n📅 ${new Date().toLocaleString()}`
        );
        
        // Отправляем уведомление модератору с кнопками
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
            `📹 НОВОЕ ВИДЕО НА МОДЕРАЦИЮ!\n\n👤 От: @${username}\n🆔 ID видео: ${videoId}\n📅 ${new Date().toLocaleString()}`,
            { reply_markup: keyboard }
        );
        
        console.log(`✅ Видео отправлено в канал ${process.env.CHANNEL_PENDING}`);
        return message.video_note.file_id;
        
    } catch (error) {
        console.error('Ошибка отправки на модерацию:', error);
        throw error;
    }
}

// ============= API ENDPOINTS =============

// Получить информацию о пользователе
app.post('/api/user', async (req, res) => {
    try {
        const { telegram_id, username, first_name } = req.body;
        await addUser(telegram_id, username, first_name);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Загрузить видео
app.post('/api/upload', upload.single('video'), async (req, res) => {
    try {
        const { user_telegram_id } = req.body;
        const videoBuffer = req.file.buffer;
        const originalName = req.file.originalname;
        
        console.log(`📹 Получено видео от ${user_telegram_id}, размер: ${videoBuffer.length} bytes`);
        
        // Получаем информацию о пользователе
        const user = await getUserById(user_telegram_id);
        const username = user?.username || 'unknown';
        
        // Сначала сохраняем в БД с временным ID
        const videoId = await addVideo(`temp_${Date.now()}`, user_telegram_id);
        
        // Отправляем на модерацию
        const fileId = await sendToModeration(videoBuffer, originalName, user_telegram_id, username, videoId);
        
        // Обновляем запись с правильным file_id
        const { db } = await import('./db.js');
        await db.run('UPDATE videos SET drive_file_id = ? WHERE id = ?', [fileId, videoId]);
        
        res.json({ 
            success: true, 
            video_id: videoId,
            message: 'Видео отправлено на модерацию'
        });
        
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Получить пользователя по ID
async function getUserById(telegram_id) {
    const { db } = await import('./db.js');
    return db.get('SELECT * FROM users WHERE telegram_id = ?', [telegram_id]);
}

// Получить ленту видео
app.get('/api/feed', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 0;
        const includeAdult = req.query.include_adult === 'true';
        const videos = await getFeed(page, 10, includeAdult);
        
        // Формируем ссылки на видео из Telegram
        const videosWithLinks = videos.map(video => ({
            ...video,
            video_url: video.drive_file_id ? `tg://video_note?file_id=${video.drive_file_id}` : null
        }));
        
        res.json(videosWithLinks);
    } catch (error) {
        console.error('Feed error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Поставить/убрать лайк
app.post('/api/like', async (req, res) => {
    try {
        const { user_telegram_id, video_id, action } = req.body;
        
        if (action === 'like') {
            await likeVideo(user_telegram_id, video_id);
        } else {
            await unlikeVideo(user_telegram_id, video_id);
        }
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Избранное
app.post('/api/favorite', async (req, res) => {
    try {
        const { user_telegram_id, video_id, action } = req.body;
        
        if (action === 'add') {
            await addToFavorites(user_telegram_id, video_id);
        } else {
            await removeFromFavorites(user_telegram_id, video_id);
        }
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Получить избранное пользователя
app.get('/api/favorites/:user_telegram_id', async (req, res) => {
    try {
        const favorites = await getUserFavorites(req.params.user_telegram_id);
        const favoritesWithLinks = favorites.map(video => ({
            ...video,
            video_url: video.drive_file_id ? `tg://video_note?file_id=${video.drive_file_id}` : null
        }));
        res.json(favoritesWithLinks);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Эндпоинт для модерации (обновление статуса)
app.post('/api/moderate', async (req, res) => {
    try {
        const { video_id, status } = req.body;
        await updateVideoStatus(video_id, status);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    console.log(`📝 Канал модерации: ${process.env.CHANNEL_PENDING}`);
});
