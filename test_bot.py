"""Quick test to check if bot is working"""
import asyncio
import aiohttp

TOKEN = "8787130283:AAEc802mSX7pS3gVdSRGpnbpHZeb9w3V6yo"

async def main():
    async with aiohttp.ClientSession() as session:
        # 1. Get bot info
        async with session.post(f"https://api.telegram.org/bot{TOKEN}/getMe") as r:
            me = await r.json()
            print(f"Bot: @{me['result']['username']} - {me['result']['first_name']}")

        # 2. Delete webhook
        async with session.post(f"https://api.telegram.org/bot{TOKEN}/deleteWebhook") as r:
            wh = await r.json()
            print(f"Webhook deleted: {wh['ok']}")

        # 3. Check if bot can send message to admin
        admin_id = 2044125331
        async with session.post(
            f"https://api.telegram.org/bot{TOKEN}/sendMessage",
            json={
                "chat_id": admin_id,
                "text": "✅ <b>CircleTok бот запущен и работает!</b>\n\nОтправь /start чтобы начать",
                "parse_mode": "HTML"
            }
        ) as r:
            msg = await r.json()
            if msg.get("ok"):
                print(f"✅ Тестовое сообщение отправлено админу! msg_id={msg['result']['message_id']}")
            else:
                print(f"❌ Ошибка: {msg}")

        # 4. Check pending updates
        async with session.post(
            f"https://api.telegram.org/bot{TOKEN}/getUpdates",
            json={"offset": -1, "timeout": 0}
        ) as r:
            updates = await r.json()
            print(f"Pending updates: {len(updates.get('result', []))}")

asyncio.run(main())