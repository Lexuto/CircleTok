import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) => {
    ctx.reply(`🎬 Добро пожаловать в CircleTok!\n\nОткрой Mini App, чтобы смотреть и загружать кружки.`);
});

// Обработчики модерации
bot.action(/approve_(.+)/, async (ctx) => {
    const id = ctx.match[1];
    await fetch(`${process.env.API_URL}/moderate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_id: id, status: 'approved' })
    });
    await ctx.answerCbQuery('✅ Одобрено');
    await ctx.editMessageText(ctx.update.callback_query.message.text + '\n\n✅ ОДОБРЕНО');
});

bot.action(/adult_(.+)/, async (ctx) => {
    const id = ctx.match[1];
    await fetch(`${process.env.API_URL}/moderate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_id: id, status: 'adult' })
    });
    await ctx.answerCbQuery('🔞 18+');
    await ctx.editMessageText(ctx.update.callback_query.message.text + '\n\n🔞 18+');
});

bot.action(/reject_(.+)/, async (ctx) => {
    const id = ctx.match[1];
    await fetch(`${process.env.API_URL}/moderate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_id: id, status: 'rejected' })
    });
    await ctx.answerCbQuery('❌ Отклонено');
    await ctx.editMessageText(ctx.update.callback_query.message.text + '\n\n❌ ОТКЛОНЕНО');
});

bot.launch();
console.log('🤖 Bot started');
