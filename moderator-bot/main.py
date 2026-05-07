import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode

from config import MODERATOR_BOT_TOKEN
from database.db import init_db
from moderator_bot.handlers import moderation

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


async def main():
    logger.info("Запуск CircleTok Модератор бота...")

    await init_db()
    logger.info("База данных инициализирована")

    bot = Bot(
        token=MODERATOR_BOT_TOKEN,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dp = Dispatcher()

    dp.include_router(moderation.router)

    logger.info("Модератор бот запущен!")
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())