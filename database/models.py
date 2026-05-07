import sqlalchemy as sa
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime

Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = sa.Column(sa.Integer, primary_key=True)
    telegram_id = sa.Column(sa.BigInteger, unique=True, nullable=False)
    username = sa.Column(sa.String(64), nullable=True)
    full_name = sa.Column(sa.String(128), nullable=True)
    is_admin = sa.Column(sa.Boolean, default=False)
    is_moderator = sa.Column(sa.Boolean, default=False)
    adult_content_enabled = sa.Column(sa.Boolean, default=False)
    avatar_file_id = sa.Column(sa.String(256), nullable=True)
    bio = sa.Column(sa.String(500), nullable=True)
    created_at = sa.Column(sa.DateTime, default=datetime.utcnow)
    last_active = sa.Column(sa.DateTime, default=datetime.utcnow)

    videos = relationship("Video", back_populates="author", cascade="all, delete-orphan")
    likes = relationship("Like", back_populates="user", cascade="all, delete-orphan")
    bookmarks = relationship("Bookmark", back_populates="user", cascade="all, delete-orphan")


class Video(Base):
    __tablename__ = "videos"

    id = sa.Column(sa.Integer, primary_key=True)
    file_id = sa.Column(sa.String(256), nullable=False)
    file_unique_id = sa.Column(sa.String(64), nullable=False)
    author_id = sa.Column(sa.Integer, sa.ForeignKey("users.id"), nullable=False)
    description = sa.Column(sa.String(1000), nullable=True)
    category = sa.Column(sa.String(32), default="regular")  # regular, adult
    status = sa.Column(sa.String(32), default="pending")  # pending, approved, rejected
    views_count = sa.Column(sa.Integer, default=0)
    likes_count = sa.Column(sa.Integer, default=0)
    created_at = sa.Column(sa.DateTime, default=datetime.utcnow)
    moderated_at = sa.Column(sa.DateTime, nullable=True)
    moderated_by = sa.Column(sa.BigInteger, nullable=True)

    author = relationship("User", back_populates="videos")
    likes = relationship("Like", back_populates="video", cascade="all, delete-orphan")
    bookmarks = relationship("Bookmark", back_populates="video", cascade="all, delete-orphan")


class Like(Base):
    __tablename__ = "likes"

    id = sa.Column(sa.Integer, primary_key=True)
    user_id = sa.Column(sa.Integer, sa.ForeignKey("users.id"), nullable=False)
    video_id = sa.Column(sa.Integer, sa.ForeignKey("videos.id"), nullable=False)
    created_at = sa.Column(sa.DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="likes")
    video = relationship("Video", back_populates="likes")

    sa.UniqueConstraint("user_id", "video_id", name="unique_like")


class Bookmark(Base):
    __tablename__ = "bookmarks"

    id = sa.Column(sa.Integer, primary_key=True)
    user_id = sa.Column(sa.Integer, sa.ForeignKey("users.id"), nullable=False)
    video_id = sa.Column(sa.Integer, sa.ForeignKey("videos.id"), nullable=False)
    created_at = sa.Column(sa.DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="bookmarks")
    video = relationship("Video", back_populates="bookmarks")

    sa.UniqueConstraint("user_id", "video_id", name="unique_bookmark")