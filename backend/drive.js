import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { PassThrough } from 'stream';
import fs from 'fs';
import path from 'path';

dotenv.config();

ffmpeg.setFfmpegPath(ffmpegStatic);

const bot = new Telegraf(process.env.BOT_TOKEN);

const CHANNELS = {
    PENDING: process.env.CHANNEL_PENDING || '@CircleTokpending',
    APPROVED: process.env.CHANNEL_APPROVED || '@CircleTokapproved',
    ADULT: process.env.CHANNEL_ADULT || '@CircleTokadult'
};

// Конвертация видео в кружок (1:1, сжатие до 1MB)
async function convertToVideoNote(inputBuffer) {
    return new Promise((resolve, reject) => {
        const outputStream = new PassThrough();
        const chunks = [];
        
        outputStream.on('data', chunk => chunks.push(chunk));
        outputStream.on('end', () => resolve(Buffer.concat(chunks)));
        outputStream.on('error', reject);
        
        // Создаём временный файл
        const tempInput = path.join(process.cwd(), `temp_input_${Date.now()}.mp4`);
        const tempOutput = path.join(process.cwd(), `temp_output_${Date.now()}.mp4`);
        
        fs.writeFileSync(tempInput, inputBuffer);
        
        ffmpeg(tempInput)
            .videoCodec('libx264')
            .audioCodec('aac')
            .size('640x640')
            .aspect('1:1')
            .duration(60)
            .outputOptions([
                '-preset fast',
                '-crf 28',
                '-b:v 500k',
                '-maxrate 500k',
                '-bufsize 1000k',
                '-pix_fmt yuv420p',
                '-movflags +faststart'
            ])
            .format('mp4')
            .on('end', () => {
                const outputBuffer = fs.readFileSync(tempOutput);
                fs.unlinkSync(tempInput);
                fs.unlinkSync(tempOutput);
                resolve(outputBuffer);
            })
            .on('error', (err) => {
                fs.unlinkSync(tempInput);
                reject(err);
            })
            .save(tempOutput);
    });
}

// Загрузка видео на модерацию
export async function uploadForModeration(videoBuffer, filename, userId) {
    try {
        console.log(`📹 Конвертируем видео для пользователя ${userId}...`);
        
        // Конвертируем в кружок
        const videoNote = await convertToVideoNote(videoBuffer);
        
        console.log(`📤 Отправляем в канал модерации ${CHANNELS.PENDING}...`);
        
        // Отправляем в канал модерации
        const message = await bot.telegram.sendVideoNote(
            CHANNELS.PENDING,
            { source: videoNote },
            {
                duration: Math.min(60, Math.floor(videoNote.length / 10000)),
                length: 640
            }
        );
        
        // Отправляем информацию о пользователе
        await bot.telegram.sendMessage(
            CHANNELS.PENDING,
            `👤 Пользователь: ${userId}\n📅 Время: ${new Date().toLocaleString()}\n📁 Файл: ${filename}`
        );
        
        console.log(`✅ Видео загружено, file_id: ${message.video_note.file_id}`);
        
        return {
            file_id: message.video_note.file_id,
            message_id: message.message_id,
            chat_id: CHANNELS.PENDING
        };
    } catch (error) {
        console.error('Upload error:', error);
        throw error;
    }
}

// Получение ссылки на видео (для Mini App)
export async function getVideoUrl(fileId) {
    // В Telegram Mini App используем прямой file_id
    return `tg://video_note?file_id=${fileId}`;
}

// Экспортируем для совместимости со старым кодом
export async function getPublicLink(fileId) {
    return getVideoUrl(fileId);
}

// Перемещение видео между каналами (для модерации)
export async function moveToChannel(fileData, targetChannel) {
    try {
        const targetChannelId = CHANNELS[targetChannel];
        
        // Копируем сообщение в целевой канал
        const copied = await bot.telegram.copyMessage(
            targetChannelId,
            CHANNELS.PENDING,
            fileData.message_id
        );
        
        // Удаляем из канала модерации
        await bot.telegram.deleteMessage(CHANNELS.PENDING, fileData.message_id);
        
        return {
            file_id: copied.video_note?.file_id || copied.document?.file_id,
            message_id: copied.message_id
        };
    } catch (error) {
        console.error('Move error:', error);
        throw error;
    }
}

// Удаление видео
export async function deleteVideo(fileId) {
    try {
        // В Telegram нельзя просто удалить файл, можно только сообщение
        console.log(`🗑 Видео ${fileId} помечено на удаление`);
    } catch (error) {
        console.error('Delete error:', error);
    }
}

// Экспорт каналов
export { CHANNELS };