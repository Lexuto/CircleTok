import aiosqlite
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, func
from database.models import Base, User, Video, Like, Bookmark
from datetime import datetime

DATABASE_URL = "sqlite+aiosqlite:///circletok.db"

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_user(telegram_id: int) -> User | None:
    async with async_session() as session:
        result = await session.execute(
            select(User).where(User.telegram_id == telegram_id)
        )
        return result.scalar_one_or_none()


async def create_user(telegram_id: int, username: str = None, full_name: str = None) -> User:
    async with async_session() as session:
        user = User(
            telegram_id=telegram_id,
            username=username,
            full_name=full_name,
        )
        session.add(user)
        await session.commit()
        return user


async def get_or_create_user(telegram_id: int, username: str = None, full_name: str = None) -> User:
    user = await get_user(telegram_id)
    if not user:
        user = await create_user(telegram_id, username, full_name)
    else:
        # Update last active
        async with async_session() as session:
            user = await session.get(User, user.id)
            user.last_active = datetime.utcnow()
            if username:
                user.username = username
            if full_name:
                user.full_name = full_name
            await session.commit()
    return user


async def add_video(file_id: str, file_unique_id: str, author_id: int, description: str = None, category: str = "regular") -> Video:
    async with async_session() as session:
        video = Video(
            file_id=file_id,
            file_unique_id=file_unique_id,
            author_id=author_id,
            description=description,
            category=category,
            status="pending",
        )
        session.add(video)
        await session.commit()
        return video


async def get_pending_videos() -> list[Video]:
    async with async_session() as session:
        result = await session.execute(
            select(Video).where(Video.status == "pending").order_by(Video.created_at)
        )
        return result.scalars().all()


async def approve_video(video_id: int, moderator_telegram_id: int):
    async with async_session() as session:
        video = await session.get(Video, video_id)
        if video:
            video.status = "approved"
            video.moderated_at = datetime.utcnow()
            video.moderated_by = moderator_telegram_id
            await session.commit()
            return video
    return None


async def reject_video(video_id: int, moderator_telegram_id: int):
    async with async_session() as session:
        video = await session.get(Video, video_id)
        if video:
            video.status = "rejected"
            video.moderated_at = datetime.utcnow()
            video.moderated_by = moderator_telegram_id
            await session.commit()
            return video
    return None


async def get_videos(category: str = "regular", exclude_user_id: int = None, limit: int = 20, offset: int = 0) -> list[Video]:
    async with async_session() as session:
        query = select(Video).where(
            Video.status == "approved",
            Video.category == category,
        )
        if exclude_user_id:
            query = query.where(Video.author_id != exclude_user_id)
        query = query.order_by(Video.created_at.desc()).limit(limit).offset(offset)
        result = await session.execute(query)
        return result.scalars().all()


async def get_video_by_id(video_id: int) -> Video | None:
    async with async_session() as session:
        return await session.get(Video, video_id)


async def get_user_videos(user_id: int, category: str = None) -> list[Video]:
    async with async_session() as session:
        query = select(Video).where(
            Video.author_id == user_id,
            Video.status == "approved",
        )
        if category:
            query = query.where(Video.category == category)
        query = query.order_by(Video.created_at.desc())
        result = await session.execute(query)
        return result.scalars().all()


async def view_video(video_id: int):
    async with async_session() as session:
        video = await session.get(Video, video_id)
        if video:
            video.views_count += 1
            await session.commit()


async def like_video(user_id: int, video_id: int) -> bool:
    async with async_session() as session:
        # Check if already liked
        existing = await session.execute(
            select(Like).where(
                Like.user_id == user_id,
                Like.video_id == video_id,
            )
        )
        if existing.scalar_one_or_none():
            return False

        like = Like(user_id=user_id, video_id=video_id)
        session.add(like)

        video = await session.get(Video, video_id)
        if video:
            video.likes_count += 1

        await session.commit()
        return True


async def unlike_video(user_id: int, video_id: int) -> bool:
    async with async_session() as session:
        existing = await session.execute(
            select(Like).where(
                Like.user_id == user_id,
                Like.video_id == video_id,
            )
        )
        like = existing.scalar_one_or_none()
        if not like:
            return False

        await session.delete(like)
        video = await session.get(Video, video_id)
        if video and video.likes_count > 0:
            video.likes_count -= 1

        await session.commit()
        return True


async def is_liked(user_id: int, video_id: int) -> bool:
    async with async_session() as session:
        result = await session.execute(
            select(Like).where(
                Like.user_id == user_id,
                Like.video_id == video_id,
            )
        )
        return result.scalar_one_or_none() is not None


async def add_bookmark(user_id: int, video_id: int) -> bool:
    async with async_session() as session:
        existing = await session.execute(
            select(Bookmark).where(
                Bookmark.user_id == user_id,
                Bookmark.video_id == video_id,
            )
        )
        if existing.scalar_one_or_none():
            return False

        bookmark = Bookmark(user_id=user_id, video_id=video_id)
        session.add(bookmark)
        await session.commit()
        return True


async def remove_bookmark(user_id: int, video_id: int) -> bool:
    async with async_session() as session:
        existing = await session.execute(
            select(Bookmark).where(
                Bookmark.user_id == user_id,
                Bookmark.video_id == video_id,
            )
        )
        bookmark = existing.scalar_one_or_none()
        if not bookmark:
            return False

        await session.delete(bookmark)
        await session.commit()
        return True


async def is_bookmarked(user_id: int, video_id: int) -> bool:
    async with async_session() as session:
        result = await session.execute(
            select(Bookmark).where(
                Bookmark.user_id == user_id,
                Bookmark.video_id == video_id,
            )
        )
        return result.scalar_one_or_none() is not None


async def get_bookmarked_videos(user_id: int) -> list[Video]:
    async with async_session() as session:
        result = await session.execute(
            select(Video).join(Bookmark).where(
                Bookmark.user_id == user_id,
                Video.status == "approved",
            ).order_by(Bookmark.created_at.desc())
        )
        return result.scalars().all()


async def get_user_stats(user_id: int) -> dict:
    async with async_session() as session:
        videos_count = await session.execute(
            select(func.count(Video.id)).where(
                Video.author_id == user_id,
                Video.status == "approved",
            )
        )
        likes_count = await session.execute(
            select(func.count(Like.id)).where(Like.user_id == user_id)
        )
        bookmarks_count = await session.execute(
            select(func.count(Bookmark.id)).where(Bookmark.user_id == user_id)
        )
        return {
            "videos": videos_count.scalar() or 0,
            "likes": likes_count.scalar() or 0,
            "bookmarks": bookmarks_count.scalar() or 0,
        }


async def update_profile(telegram_id: int, bio: str = None, avatar_file_id: str = None):
    async with async_session() as session:
        result = await session.execute(
            select(User).where(User.telegram_id == telegram_id)
        )
        user = result.scalar_one_or_none()
        if user:
            if bio is not None:
                user.bio = bio
            if avatar_file_id is not None:
                user.avatar_file_id = avatar_file_id
            await session.commit()


async def toggle_adult_content(telegram_id: int) -> bool:
    async with async_session() as session:
        result = await session.execute(
            select(User).where(User.telegram_id == telegram_id)
        )
        user = result.scalar_one_or_none()
        if user:
            user.adult_content_enabled = not user.adult_content_enabled
            await session.commit()
            return user.adult_content_enabled
        return False