from aiogram import Router, F
from aiogram.filters import Command
from aiogram.types import Message, CallbackQuery, InlineKeyboardButton
from aiogram.utils.keyboard import InlineKeyboardBuilder
from database.db import (
    get_pending_videos, get_video_by_id, get_user,
    approve_video, reject_video,
)
from config import ADMIN_ID, MODERATORS

router = Router()


def is_moderator(telegram_id: int) -> bool:
    return telegram_id == ADMIN_ID or telegram_id in MODERATORS


@router.message(Command("start"))
async def cmd_start(message: Message):
    if not is_moderator(message.from_user.id):
        await message.answer("⛔ У вас нет доступа к этому боту.")
        return

    await message.answer(
        "🔞 <b>CircleTok Модератор</b>\n\n"
        "Здесь ты можешь проверять видео перед публикацией.\n\n"
        "📹 <b>Доступные команды:</b>\n"
        "/pending — показать видео на проверку\n"
        "/stats — статистика ожидающих\n\n"
        "Видео показываются по одному с кнопками:\n"
        "✅ <b>Обычное</b> — одобрить в общую ленту\n"
        "🔞 <b>18+</b> — одобрить в 18+ раздел\n"
        "❌ <b>Отклонить</b> — удалить заявку",
        parse_mode="HTML",
    )


@router.message(Command("pending"))
async def cmd_pending(message: Message):
    if not is_moderator(message.from_user.id):
        return

    pending = await get_pending_videos()

    if not pending:
        await message.answer("✅ Нет видео на проверке!")
        return

    # Show first pending video
    video = pending[0]
    author = await get_user_by_id(video.author_id)
    author_info = f"@{author.username}" if author and author.username else f"ID: {video.telegram_id if author else 'Unknown'}"

    builder = InlineKeyboardBuilder()
    builder.add(InlineKeyboardButton(
        text="✅ Обычное",
        callback_data=f"mod_approve_{video.id}_regular"
    ))
    builder.add(InlineKeyboardButton(
        text="🔞 18+",
        callback_data=f"mod_approve_{video.id}_adult"
    ))
    builder.add(InlineKeyboardButton(
        text="❌ Отклонить",
        callback_data=f"mod_reject_{video.id}"
    ))
    builder.adjust(2, 1)

    caption = (
        f"📹 <b>Видео #{video.id}</b>\n"
        f"━━━━━━━━━━━━━━━\n"
        f"👤 Автор: {author_info}\n"
        f"📅 Отправлено: {video.created_at.strftime('%d.%m.%Y %H:%M')}\n"
        f"🏷 Категория: {video.category}\n"
    )
    if video.description:
        caption += f"📝 {video.description}\n"

    await message.answer_video_note(
        video_note=video.file_id,
        caption=caption,
        reply_markup=builder.as_markup(),
        parse_mode="HTML",
    )


async def get_user_by_id(user_id: int):
    from sqlalchemy import select
    from database.models import User
    from database.db import async_session
    async with async_session() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()


@router.callback_query(F.data.startswith("mod_approve_"))
async def callback_approve(callback: CallbackQuery):
    if not is_moderator(callback.from_user.id):
        await callback.answer("Нет доступа")
        return

    parts = callback.data.split("_")
    video_id = int(parts[2])
    category = parts[3]  # regular or adult

    video = await get_video_by_id(video_id)
    if not video:
        await callback.answer("Видео не найдено")
        return

    # Update video
    from database.db import async_session
    from database.models import Video as VideoModel
    from datetime import datetime

    async with async_session() as session:
        v = await session.get(VideoModel, video_id)
        v.status = "approved"
        v.category = category
        v.moderated_at = datetime.utcnow()
        v.moderated_by = callback.from_user.id
        await session.commit()

    emoji = "🔞" if category == "adult" else "✅"
    await callback.message.edit_caption(
        caption=callback.message.caption + f"\n\n{emoji} <b>ОДОБРЕНО</b> ({category})",
        reply_markup=None,
        parse_mode="HTML",
    )

    await callback.answer(f"✅ Видео #{video_id} одобрено как {category}!")


@router.callback_query(F.data.startswith("mod_reject_"))
async def callback_reject(callback: CallbackQuery):
    if not is_moderator(callback.from_user.id):
        await callback.answer("Нет доступа")
        return

    video_id = int(callback.data.split("_")[2])

    await reject_video(video_id, callback.from_user.id)

    await callback.message.edit_caption(
        caption=callback.message.caption + "\n\n❌ <b>ОТКЛОНЕНО</b>",
        reply_markup=None,
        parse_mode="HTML",
    )

    await callback.answer(f"❌ Видео #{video_id} отклонено")


@router.message(Command("stats"))
async def cmd_stats(message: Message):
    if not is_moderator(message.from_user.id):
        return

    pending = await get_pending_videos()
    await message.answer(
        f"📊 <b>Статистика модерации</b>\n\n"
        f"📹 Ожидает проверки: <b>{len(pending)}</b>\n\n"
        f"Используй /pending чтобы начать проверку",
        parse_mode="HTML",
    )