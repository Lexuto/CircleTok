from aiogram import Router, F
from aiogram.types import Message, CallbackQuery
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from database.db import (
    add_video, get_videos, get_video_by_id, view_video,
    like_video, unlike_video, is_liked,
    add_bookmark, remove_bookmark, is_bookmarked,
    get_or_create_user, get_user_videos,
    async_session,
)
from database.models import Video as VideoModel
from bot.keyboards.reply import main_keyboard, video_action_keyboard

router = Router()


class UploadVideo(StatesGroup):
    waiting_file = State()
    waiting_category = State()
    waiting_description = State()


@router.message(F.video_note)
async def handle_video_note(message: Message, state: FSMContext):
    """Handle video circle upload"""
    await get_or_create_user(
        telegram_id=message.from_user.id,
        username=message.from_user.username,
        full_name=message.from_user.full_name,
    )

    await state.update_data(
        file_id=message.video_note.file_id,
        file_unique_id=message.video_note.file_unique_id,
    )

    await message.answer(
        "📹 <b>Кружок получен!</b>\n\n"
        "Напиши <b>1</b> — если это обычное видео\n"
        "Напиши <b>2</b> — если это 18+ контент\n\n"
        "Или просто напиши описание/название к видео, "
        "а затем выбери категорию.",
        parse_mode="HTML",
    )
    await state.set_state(UploadVideo.waiting_category)


@router.message(UploadVideo.waiting_category, F.text.in_({"1", "2"}))
async def handle_category_choice(message: Message, state: FSMContext):
    category = "regular" if message.text == "1" else "adult"
    data = await state.get_data()

    user = await get_or_create_user(message.from_user.id)
    video = await add_video(
        file_id=data["file_id"],
        file_unique_id=data["file_unique_id"],
        author_id=user.id,
        description=data.get("description"),
        category=category,
    )

    await state.clear()
    await message.answer(
        "✅ <b>Кружок отправлен на модерацию!</b>\n"
        "После проверки он появится в ленте.\n\n"
        "Статус можно отследить в профиле.",
        parse_mode="HTML",
        reply_markup=main_keyboard(),
    )


@router.message(UploadVideo.waiting_category)
async def handle_category_description(message: Message, state: FSMContext):
    """Save description and ask category again"""
    await state.update_data(description=message.text)
    await message.answer(
        "📝 Описание сохранено! Теперь выбери категорию:\n\n"
        "<b>1</b> — Обычное видео\n"
        "<b>2</b> — 18+ контент",
        parse_mode="HTML",
    )
    # Stay in waiting_category state


@router.message(F.video_note)
async def handle_video_note_no_state(message: Message, state: FSMContext):
    """Handle video when not in upload state - start upload"""
    await handle_video_note(message, state)


async def send_video_to_user(message: Message, video, user_id: int):
    """Helper to send video to chat"""
    user = await get_or_create_user(user_id)
    liked = await is_liked(user.id, video.id)
    bookmarked = await is_bookmarked(user.id, video.id)
    is_author = video.author_id == user.id

    await view_video(video.id)

    caption = (
        f"👤 <b>Автор:</b> {video.author.full_name or 'User'}\n"
        f"👁 {video.views_count} ❤️ {video.likes_count}"
    )
    if video.description:
        caption = f"📝 {video.description}\n\n" + caption

    await message.answer_video_note(
        video_note=video.file_id,
        caption=caption,
        reply_markup=video_action_keyboard(
            video.id, liked, bookmarked, is_author
        ),
        parse_mode="HTML",
    )


@router.callback_query(F.data.startswith("like_"))
async def callback_like(callback: CallbackQuery):
    video_id = int(callback.data.split("_")[1])
    user = await get_or_create_user(callback.from_user.id)
    video = await get_video_by_id(video_id)

    if not video:
        await callback.answer("❌ Видео не найдено")
        return

    liked = await is_liked(user.id, video_id)
    if liked:
        await unlike_video(user.id, video_id)
        await callback.answer("❤️ Лайк убран")
    else:
        await like_video(user.id, video_id)
        await callback.answer("❤️ Лайк поставлен!")

    liked_new = await is_liked(user.id, video_id)
    bookmarked = await is_bookmarked(user.id, video_id)
    is_author = video.author_id == user.id
    await callback.message.edit_reply_markup(
        reply_markup=video_action_keyboard(video_id, liked_new, bookmarked, is_author)
    )


@router.callback_query(F.data.startswith("bookmark_"))
async def callback_bookmark(callback: CallbackQuery):
    video_id = int(callback.data.split("_")[1])
    user = await get_or_create_user(callback.from_user.id)
    video = await get_video_by_id(video_id)

    if not video:
        await callback.answer("❌ Видео не найдено")
        return

    bookmarked = await is_bookmarked(user.id, video_id)
    if bookmarked:
        await remove_bookmark(user.id, video_id)
        await callback.answer("📑 Убрано из закладок")
    else:
        await add_bookmark(user.id, video_id)
        await callback.answer("🔖 Добавлено в закладки!")

    liked = await is_liked(user.id, video_id)
    is_author = video.author_id == user.id
    await callback.message.edit_reply_markup(
        reply_markup=video_action_keyboard(video_id, liked, not bookmarked, is_author)
    )


@router.callback_query(F.data.startswith("next_"))
async def callback_next(callback: CallbackQuery):
    video_id = int(callback.data.split("_")[1])
    user = await get_or_create_user(callback.from_user.id)

    videos = await get_videos(exclude_user_id=user.id, limit=50)
    current_idx = None
    for i, v in enumerate(videos):
        if v.id == video_id:
            current_idx = i
            break

    if current_idx is None or current_idx + 1 >= len(videos):
        await callback.answer("🎬 Это было последнее видео!")
        return

    next_video = videos[current_idx + 1]
    liked = await is_liked(user.id, next_video.id)
    bookmarked = await is_bookmarked(user.id, next_video.id)
    is_author = next_video.author_id == user.id

    await view_video(next_video.id)

    caption = (
        f"👤 <b>Автор:</b> {next_video.author.full_name or 'User'}\n"
        f"👁 {next_video.views_count} ❤️ {next_video.likes_count}"
    )
    if next_video.description:
        caption = f"📝 {next_video.description}\n\n" + caption

    await callback.message.answer_video_note(
        video_note=next_video.file_id,
        caption=caption,
        reply_markup=video_action_keyboard(
            next_video.id, liked, bookmarked, is_author
        ),
        parse_mode="HTML",
    )
    await callback.message.delete()
    await callback.answer()


@router.callback_query(F.data.startswith("delete_"))
async def callback_delete(callback: CallbackQuery):
    video_id = int(callback.data.split("_")[1])
    user = await get_or_create_user(callback.from_user.id)
    video = await get_video_by_id(video_id)

    if not video or video.author_id != user.id:
        await callback.answer("⛔ Нельзя удалить")
        return

    async with async_session() as session:
        v = await session.get(VideoModel, video_id)
        if v:
            await session.delete(v)
            await session.commit()

    await callback.answer("🗑 Видео удалено")
    await callback.message.delete()