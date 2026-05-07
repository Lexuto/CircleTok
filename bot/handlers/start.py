from aiogram import Router, F
from aiogram.filters import Command
from aiogram.types import Message, CallbackQuery
from database.db import get_or_create_user
from bot.keyboards.reply import main_keyboard

router = Router()


@router.message(Command("start"))
async def cmd_start(message: Message):
    user = await get_or_create_user(
        telegram_id=message.from_user.id,
        username=message.from_user.username,
        full_name=message.from_user.full_name,
    )

    await message.answer(
        f"👋 Добро пожаловать в <b>CircleTok</b>!\n\n"
        f"🎬 Здесь ты можешь смотреть и загружать видео-кружки\n"
        f"❤️ Ставить лайки, делать закладки\n"
        f"🔞 Есть раздел 18+ (с подтверждением)\n\n"
        f"📹 <b>Как загрузить кружок?</b>\n"
        f"Просто отправь мне видео-сообщение (кружок) — "
        f"оно уйдёт на модерацию и после проверки появится в ленте!\n\n"
        f"👇 Используй кнопки ниже:",
        reply_markup=main_keyboard(),
        parse_mode="HTML",
    )


@router.message(Command("help"))
async def cmd_help(message: Message):
    await message.answer(
        "📖 <b>Помощь CircleTok</b>\n\n"
        "🎬 <b>Смотреть кружки</b> — лента видео\n"
        "👤 <b>Профиль</b> — твои видео, био, аватар, статистика\n"
        "📌 <b>Закладки</b> — сохранённые видео\n"
        "🔞 <b>18+ контент</b> — доступ после подтверждения возраста\n\n"
        "📹 Отправь видео-кружок чтобы загрузить его\n"
        "✏️ В разделе профиль можно изменить описание и аватар",
        parse_mode="HTML",
    )