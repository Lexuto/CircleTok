from aiogram.types import ReplyKeyboardMarkup, KeyboardButton, InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.utils.keyboard import ReplyKeyboardBuilder, InlineKeyboardBuilder


def main_keyboard() -> ReplyKeyboardMarkup:
    builder = ReplyKeyboardBuilder()
    builder.add(KeyboardButton(text="🎬 Смотреть кружки"))
    builder.add(KeyboardButton(text="👤 Профиль"))
    builder.add(KeyboardButton(text="📌 Закладки"))
    builder.add(KeyboardButton(text="🔞 18+ контент"))
    builder.adjust(2)
    return builder.as_markup(resize_keyboard=True)


def profile_keyboard(is_admin: bool = False) -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    builder.add(InlineKeyboardButton(text="📹 Мои видео", callback_data="my_videos"))
    builder.add(InlineKeyboardButton(text="✏️ Описание (био)", callback_data="edit_bio"))
    builder.add(InlineKeyboardButton(text="🖼 Сменить аватар", callback_data="edit_avatar"))
    builder.add(InlineKeyboardButton(text="📊 Статистика", callback_data="stats"))
    if is_admin:
        builder.add(InlineKeyboardButton(text="⚙️ Модерация", callback_data="admin_panel"))
    builder.adjust(1)
    return builder.as_markup()


def adult_confirm_keyboard() -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    builder.add(InlineKeyboardButton(text="✅ Да, мне есть 18", callback_data="adult_confirm"))
    builder.add(InlineKeyboardButton(text="❌ Нет, вернуться", callback_data="adult_cancel"))
    builder.adjust(1)
    return builder.as_markup()


def video_action_keyboard(
    video_id: int,
    is_liked: bool = False,
    is_bookmarked: bool = False,
    is_author: bool = False,
) -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()

    like_btn = "❤️" if not is_liked else "💔"
    builder.add(InlineKeyboardButton(text=f"{like_btn} {'' if not is_liked else 'Unlike'}", callback_data=f"like_{video_id}"))

    bookmark_btn = "🔖" if not is_bookmarked else "📑"
    builder.add(InlineKeyboardButton(text=f"{bookmark_btn}", callback_data=f"bookmark_{video_id}"))

    builder.add(InlineKeyboardButton(text="▶️ Следующее", callback_data=f"next_{video_id}"))

    if is_author:
        builder.add(InlineKeyboardButton(text="🗑 Удалить", callback_data=f"delete_{video_id}"))

    builder.adjust(3, 1)
    return builder.as_markup()