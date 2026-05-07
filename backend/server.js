import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initializeDB, addUser, addVideo, updateVideoStatus, likeVideo, unlikeVideo, addToFavorites, removeFromFavorites, getFeed, getUserFavorites } from './db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

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

// Загрузить видео (упрощённая версия пока без отправки в канал)
app.post('/api/upload', upload.single('video'), async (req, res) => {
    try {
        const { user_telegram_id } = req.body;
        
        // Пока просто сохраняем заглушку
        const videoId = await addVideo('temp_file_id', user_telegram_id);
        
        res.json({ 
            success: true, 
            video_id: videoId,
            message: 'Функция загрузки видео в разработке'
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Получить ленту видео
app.get('/api/feed', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 0;
        const includeAdult = req.query.include_adult === 'true';
        const videos = await getFeed(page, 10, includeAdult);
        
        res.json(videos);
    } catch (error) {
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
        res.json(favorites);
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
});