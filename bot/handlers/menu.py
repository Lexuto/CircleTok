from aiogram import Router, F
from aiogram.types import Message, CallbackQuery
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from database.db import (
    get_or_create_user, get_user, get_videos, get_video_by_id,
    get_user_videos, get_bookmarked_videos, get_user_stats,
    update_profile, toggle_adult_content, is_liked, is_bookmarked, view_video,
)
from bot.keyboards.reply import (
    main_keyboard, profile_keyboard, adult_confirm_keyboard,
    video_action_keyboard,
)
from config import ADMIN_ID, WEBAPP_URL

router = Router()


class ProfileStates(StatesGroup):
    waiting_bio = State()
    waiting_avatar = State()


@router.message(F.text == "🎬 Смотреть кружки")
async def button_watch(message: Message):
    user = await get_or_create_user(
        telegram_id=message.from_user.id,
        username=message.from_user.username,
        full_name=message.from_user.full_name,
    )

    videos = await get_videos(category="regular", exclude_user_id=user.id, limit=1)
    if not videos:
        await message.answer(
            "😕 Пока нет видео в ленте.\n\n"
            "Отправь свой первый кружок, чтобы начать!",
            reply_markup=main_keyboard(),
        )
        return

    video = videos[0]
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
        reply_markup=video_action_keyboard(video.id, liked, bookmarked, is_author),
        parse_mode="HTML",
    )


@router.message(F.text == "👤 Профиль")
async def button_profile(message: Message):
    user = await get_or_create_user(
        telegram_id=message.from_user.id,
        username=message.from_user.username,
        full_name=message.from_user.full_name,
    )

    stats = await get_user_stats(user.id)

    text = (
        f"👤 <b>Твой профиль</b>\n\n"
        f"🆔 <b>ID:</b> {user.telegram_id}\n"
        f"👤 <b>Имя:</b> {user.full_name or 'Не указано'}\n"
        f"📝 <b>Био:</b> {user.bio or 'Не указано'}\n"
        f"📹 <b>Видео:</b> {stats['videos']}\n"
        f"❤️ <b>Лайков поставлено:</b> {stats['likes']}\n"
        f"📌 <b>Закладок:</b> {stats['bookmarks']}\n"
    )

    is_admin = user.telegram_id == ADMIN_ID or user.is_admin or user.is_moderator

    if user.adult_content_enabled:
        text += "\n🔞 18+ контент: <b>Включён</b>"

    if user.avatar_file_id:
        await message.answer_photo(
            photo=user.avatar_file_id,
            caption=text,
            reply_markup=profile_keyboard(is_admin),
            parse_mode="HTML",
        )
    else:
        await message.answer(
            text,
            reply_markup=profile_keyboard(is_admin),
            parse_mode="HTML",
        )


@router.callback_query(F.data == "my_videos")
async def callback_my_videos(callback: CallbackQuery):
    user = await get_or_create_user(callback.from_user.id)
    videos = await get_user_videos(user.id)

    if not videos:
        await callback.answer("У тебя пока нет видео!")
        return

    video = videos[0]
    liked = await is_liked(user.id, video.id)
    bookmarked = await is_bookmarked(user.id, video.id)

    caption = (
        f"📹 <b>Твои видео ({len(videos)})</b>\n"
        f"━━━━━━━━━━━━━━━\n\n"
    )
    if video.description:
        caption += f"📝 {video.description}\n\n"
    caption += f"👁 {video.views_count} ❤️ {video.likes_count}"

    await callback.message.answer_video_note(
        video_note=video.file_id,
        caption=caption,
        reply_markup=video_action_keyboard(
            video.id, liked, bookmarked, True
        ),
        parse_mode="HTML",
    )
    await callback.answer()


@router.callback_query(F.data == "edit_bio")
async def callback_edit_bio(callback: CallbackQuery, state: FSMContext):
    await callback.message.answer(
        "✏️ <b>Напиши новое описание (био) для профиля:</b>\n\n"
        "Отправь текстовое сообщение. До 500 символов.\n"
        "Или отправь /cancel для отмены.",
        parse_mode="HTML",
    )
    await state.set_state(ProfileStates.waiting_bio)
    await callback.answer()


@router.message(ProfileStates.waiting_bio)
async def process_bio(message: Message, state: FSMContext):
    if message.text == "/cancel":
        await state.clear()
        await message.answer("❌ Отменено", reply_markup=main_keyboard())
        return

    bio = message.text[:500]
    await update_profile(message.from_user.id, bio=bio)
    await state.clear()
    await message.answer(
        "✅ <b>Био обновлено!</b>",
        parse_mode="HTML",
        reply_markup=main_keyboard(),
    )


@router.callback_query(F.data == "edit_avatar")
async def callback_edit_avatar(callback: CallbackQuery, state: FSMContext):
    await callback.message.answer(
        "🖼 <b>Отправь фото для аватара профиля:</b>\n\n"
        "Отправь изображение (не сжатое).\n"
        "Или отправь /cancel для отмены.",
        parse_mode="HTML",
    )
    await state.set_state(ProfileStates.waiting_avatar)
    await callback.answer()


@router.message(ProfileStates.waiting_avatar, F.photo)
async def process_avatar(message: Message, state: FSMContext):
    file_id = message.photo[-1].file_id
    await update_profile(message.from_user.id, avatar_file_id=file_id)
    await state.clear()
    await message.answer(
        "✅ <b>Аватар обновлён!</b>",
        parse_mode="HTML",
        reply_markup=main_keyboard(),
    )


@router.message(ProfileStates.waiting_avatar)
async def process_avatar_invalid(message: Message, state: FSMContext):
    if message.text == "/cancel":
        await state.clear()
        await message.answer("❌ Отменено", reply_markup=main_keyboard())
        return
    await message.answer("❌ Пожалуйста, отправь фото!")


@router.callback_query(F.data == "stats")
async def callback_stats(callback: CallbackQuery):
    user = await get_or_create_user(callback.from_user.id)
    stats = await get_user_stats(user.id)

    await callback.message.answer(
        f"📊 <b>Твоя статистика</b>\n\n"
        f"📹 Загружено видео: <b>{stats['videos']}</b>\n"
        f"❤️ Поставлено лайков: <b>{stats['likes']}</b>\n"
        f"📌 В закладках: <b>{stats['bookmarks']}</b>\n",
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(F.text == "📌 Закладки")
async def button_bookmarks(message: Message):
    user = await get_or_create_user(
        telegram_id=message.from_user.id,
        username=message.from_user.username,
        full_name=message.from_user.full_name,
    )

    videos = await get_bookmarked_videos(user.id)
    if not videos:
        await message.answer(
            "📌 <b>У тебя пока нет закладок.</b>\n\n"
            "Нажимай 🔖 под видео, чтобы сохранить!",
            parse_mode="HTML",
            reply_markup=main_keyboard(),
        )
        return

    video = videos[0]
    liked = await is_liked(user.id, video.id)
    is_author = video.author_id == user.id

    caption = (
        f"📌 <b>Закладки ({len(videos)})</b>\n"
        f"━━━━━━━━━━━━━━━\n\n"
    )
    if video.description:
        caption += f"📝 {video.description}\n\n"
    caption += f"👁 {video.views_count} ❤️ {video.likes_count}"

    await message.answer_video_note(
        video_note=video.file_id,
        caption=caption,
        reply_markup=video_action_keyboard(video.id, liked, True, is_author),
        parse_mode="HTML",
    )


@router.message(F.text == "🔞 18+ контент")
async def button_adult(message: Message):
    user = await get_or_create_user(
        telegram_id=message.from_user.id,
        username=message.from_user.username,
        full_name=message.from_user.full_name,
    )

    if user.adult_content_enabled:
        # Show adult content
        videos = await get_videos(category="adult", exclude_user_id=user.id, limit=1)
        if not videos:
            await message.answer(
                "🔞 <b>В разделе 18+ пока нет видео.</b>\n\n"
                "Отправь кружок и выбери категорию 18+, чтобы добавить.",
                parse_mode="HTML",
                reply_markup=main_keyboard(),
            )
            return

        video = videos[0]
        liked = await is_liked(user.id, video.id)
        bookmarked = await is_bookmarked(user.id, video.id)
        is_author = video.author_id == user.id

        await view_video(video.id)

        caption = (
            f"🔞 <b>18+</b>\n"
            f"👤 Автор: {video.author.full_name or 'User'}\n"
            f"👁 {video.views_count} ❤️ {video.likes_count}"
        )
        if video.description:
            caption = f"📝 {video.description}\n\n" + caption

        await message.answer_video_note(
            video_note=video.file_id,
            caption=caption,
            reply_markup=video_action_keyboard(video.id, liked, bookmarked, is_author),
            parse_mode="HTML",
        )
    else:
        await message.answer(
            "🔞 <b>Раздел 18+</b>\n\n"
            "⚠️ Здесь могут быть видео с контентом для взрослых.\n"
            "Подтверди, что тебе есть 18 лет:",
            parse_mode="HTML",
            reply_markup=adult_confirm_keyboard(),
        )


@router.callback_query(F.data == "adult_confirm")
async def callback_adult_confirm(callback: CallbackQuery):
    await toggle_adult_content(callback.from_user.id)
    await callback.message.edit_text(
        "✅ <b>Доступ к 18+ контенту включён!</b>\n\n"
        "Теперь ты можешь смотреть и загружать видео в раздел 18+.\n"
        "Нажми <b>🔞 18+ контент</b> снова.",
        parse_mode="HTML",
        reply_markup=main_keyboard(),
    )
    await callback.answer()


@router.callback_query(F.data == "adult_cancel")
async def callback_adult_cancel(callback: CallbackQuery):
    await callback.message.edit_text(
        "❌ Доступ не подтверждён. Возвращайся, если передумаешь.",
        reply_markup=main_keyboard(),
    )
    await callback.answer()


@router.callback_query(F.data == "admin_panel")
async def callback_admin_panel(callback: CallbackQuery):
    user = await get_user(callback.from_user.id)
    if not user or (user.telegram_id != ADMIN_ID and not user.is_admin and not user.is_moderator):
        await callback.answer("Нет доступа")
        return

    from database.db import get_pending_videos
    pending = await get_pending_videos()

    await callback.message.answer(
        f"⚙️ <b>Панель модерации</b>\n\n"
        f"📹 Ожидает проверки: <b>{len(pending)} видео</b>\n\n"
        f"Воспользуйся ботом-модератором для проверки видео:\n"
        f"@ваш_модератор_бот_bot",
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(F.text == "Назад")
async def button_back(message: Message):
    await message.answer("Главное меню:", reply_markup=main_keyboard())