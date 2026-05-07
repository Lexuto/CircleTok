import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);

async function testChannels() {
    console.log('🔍 Тестируем каналы CircleTok...\n');
    
    const channels = [
        { name: '📝 Модерация', username: '@CircleTokpending' },
        { name: '✅ Одобренные', username: '@CircleTokapproved' },
        { name: '🔞 18+', username: '@CircleTokadult' }
    ];
    
    for (const channel of channels) {
        try {
            await bot.telegram.sendMessage(
                channel.username, 
                `✅ Канал работает! ${new Date().toLocaleTimeString()}`
            );
            console.log(`✅ ${channel.name}: ${channel.username} - OK`);
        } catch (error) {
            console.error(`❌ ${channel.name}: ${channel.username} - ОШИБКА`);
            console.error(`   ${error.description || error.message}`);
        }
    }
}

testChannels();