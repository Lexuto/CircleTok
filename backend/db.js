import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

let db;

export async function initializeDB() {
  db = await open({
    filename: './circles.db',
    driver: sqlite3.Database
  });

  // Таблица пользователей
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT UNIQUE,
      username TEXT,
      first_name TEXT,
      avatar_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Таблица видео
  await db.exec(`
    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      drive_file_id TEXT UNIQUE,
      user_telegram_id TEXT,
      status TEXT DEFAULT 'pending', -- pending, approved, adult, rejected
      likes_count INTEGER DEFAULT 0,
      views_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      approved_at DATETIME
    )
  `);

  // Таблица лайков
  await db.exec(`
    CREATE TABLE IF NOT EXISTS likes (
      user_telegram_id TEXT,
      video_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_telegram_id, video_id)
    )
  `);

  // Таблица избранного
  await db.exec(`
    CREATE TABLE IF NOT EXISTS favorites (
      user_telegram_id TEXT,
      video_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_telegram_id, video_id)
    )
  `);

  console.log('✅ База данных готова');
}

export async function addUser(telegram_id, username, first_name) {
  return db.run(
    'INSERT OR IGNORE INTO users (telegram_id, username, first_name) VALUES (?, ?, ?)',
    [telegram_id, username, first_name]
  );
}

export async function addVideo(drive_file_id, user_telegram_id) {
  const result = await db.run(
    'INSERT INTO videos (drive_file_id, user_telegram_id) VALUES (?, ?)',
    [drive_file_id, user_telegram_id]
  );
  return result.lastID;
}

export async function updateVideoStatus(video_id, status) {
  return db.run(
    'UPDATE videos SET status = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?',
    [status, video_id]
  );
}

export async function likeVideo(user_telegram_id, video_id) {
  await db.run(
    'INSERT OR IGNORE INTO likes (user_telegram_id, video_id) VALUES (?, ?)',
    [user_telegram_id, video_id]
  );
  await db.run('UPDATE videos SET likes_count = likes_count + 1 WHERE id = ?', [video_id]);
}

export async function unlikeVideo(user_telegram_id, video_id) {
  await db.run(
    'DELETE FROM likes WHERE user_telegram_id = ? AND video_id = ?',
    [user_telegram_id, video_id]
  );
  await db.run('UPDATE videos SET likes_count = likes_count - 1 WHERE id = ?', [video_id]);
}

export async function addToFavorites(user_telegram_id, video_id) {
  await db.run(
    'INSERT OR IGNORE INTO favorites (user_telegram_id, video_id) VALUES (?, ?)',
    [user_telegram_id, video_id]
  );
}

export async function removeFromFavorites(user_telegram_id, video_id) {
  await db.run(
    'DELETE FROM favorites WHERE user_telegram_id = ? AND video_id = ?',
    [user_telegram_id, video_id]
  );
}

export async function getFeed(page = 0, limit = 10, includeAdult = false) {
  const status = includeAdult ? 'approved' : 'approved';
  const adultFilter = includeAdult ? '' : 'AND v.status != "adult"';
  
  return db.all(`
    SELECT v.*, u.username, u.first_name 
    FROM videos v
    JOIN users u ON u.telegram_id = v.user_telegram_id
    WHERE v.status IN ('approved', ?)
    ${adultFilter}
    ORDER BY v.created_at DESC
    LIMIT ? OFFSET ?
  `, [status, limit, page * limit]);
}

export async function getUserFavorites(user_telegram_id) {
  return db.all(`
    SELECT v.*, u.username, u.first_name
    FROM favorites f
    JOIN videos v ON v.id = f.video_id
    JOIN users u ON u.telegram_id = v.user_telegram_id
    WHERE f.user_telegram_id = ? AND v.status IN ('approved', 'adult')
    ORDER BY f.created_at DESC
  `, [user_telegram_id]);
}