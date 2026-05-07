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

// Бот для модерации
const bot = new Telegraf(process.env.BOT_TOKEN);

async function sendToModeration(buffer, userId, username, videoId) {
    const msg = await bot.telegram.sendVideoNote('@CircleTokpending', { source: buffer }, { duration: 60, length: 640 });
    await bot.telegram.sendMessage('@CircleTokpending', `👤 @${username}\n🎬 #${videoId}`);
    
    const keyboard = {
        inline_keyboard: [
            [{ text: "✅ Общая лента", callback_data: `approve_${videoId}` }, { text: "🔞 18+", callback_data: `adult_${videoId}` }],
            [{ text: "❌ Отклонить", callback_data: `reject_${videoId}` }]
        ]
    };
    await bot.telegram.sendMessage(process.env.MODERATOR_ID, `📹 Новое видео от @${username}\nID: ${videoId}`, { reply_markup: keyboard });
    return msg.video_note.file_id;
}

// API
app.post('/api/user', async (req, res) => {
    try {
        const { telegram_id, username, first_name } = req.body;
        await db.run('INSERT OR IGNORE INTO users (telegram_id, username, first_name) VALUES (?, ?, ?)', [telegram_id, username, first_name]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/upload', upload.single('video'), async (req, res) => {
    try {
        const { user_telegram_id } = req.body;
        const buffer = req.file.buffer;
        
        const user = await db.get('SELECT username FROM users WHERE telegram_id = ?', [user_telegram_id]);
        const username = user?.username || 'unknown';
        
        const result = await db.run('INSERT INTO videos (user_telegram_id) VALUES (?)', [user_telegram_id]);
        const videoId = result.lastID;
        
        const fileId = await sendToModeration(buffer, user_telegram_id, username, videoId);
        await db.run('UPDATE videos SET file_id = ? WHERE id = ?', [fileId, videoId]);
        
        res.json({ success: true, video_id: videoId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/feed', async (req, res) => {
    try {
        const adult = req.query.adult === 'true';
        const videos = await db.all(`
            SELECT v.*, u.username, u.first_name 
            FROM videos v JOIN users u ON u.telegram_id = v.user_telegram_id 
            WHERE v.status IN ('approved', ?)
            ORDER BY v.created_at DESC LIMIT 30
        `, [adult ? 'adult' : 'approved']);
        res.json(videos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/moderate', async (req, res) => {
    try {
        const { video_id, status } = req.body;
        await db.run('UPDATE videos SET status = ? WHERE id = ?', [status, video_id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Запуск
initDB().then(() => {
    app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
});
