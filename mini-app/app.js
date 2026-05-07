// CircleTok Mini App
const tg = window.Telegram.WebApp;
tg.expand();

let currentVideos = [];
let currentVideoIndex = 0;
let currentView = 'feed';

// API endpoint — используем локальный сервер или продакшн
const API_BASE = 'http://localhost:8000/api';

// Получаем ID пользователя Telegram
const tgUser = tg.initDataUnsafe?.user;
const TELEGRAM_ID = tgUser?.id || 0;
const USERNAME = tgUser?.username || null;
const FULL_NAME = tgUser?.first_name || 'User';

// DOM Elements
const videoContainer = document.getElementById('video-container');
const feedView = document.getElementById('feed-view');
const profileView = document.getElementById('profile-view');
const bookmarksView = document.getElementById('bookmarks-view');

// Navigation
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        switchView(view);
    });
});

document.querySelectorAll('.back-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        switchView('feed');
    });
});

function switchView(view) {
    currentView = view;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    const viewMap = {
        'feed': 'feed-view',
        'profile': 'profile-view',
        'bookmarks': 'bookmarks-view'
    };

    document.getElementById(viewMap[view]).classList.add('active');
    document.querySelector(`.nav-btn[data-view="${view}"]`)?.classList.add('active');

    if (view === 'feed') {
        loadVideos();
    } else if (view === 'profile') {
        loadProfile();
    } else if (view === 'bookmarks') {
        loadBookmarks();
    }
}

// Render a video circle card
function createVideoCard(video, index) {
    const card = document.createElement('div');
    card.className = 'video-card';
    card.style.display = index === 0 ? 'flex' : 'none';

    const authorName = video.author_name || 'User';

    // Создаём контейнер для кругового видео
    const videoWrapper = document.createElement('div');
    videoWrapper.className = 'video-circle-wrapper';

    const videoElem = document.createElement('video');
    videoElem.className = 'video-circle';
    videoElem.src = video.file_url;
    videoElem.loop = true;
    videoElem.playsInline = true;
    videoElem.muted = true;
    videoElem.autoplay = true;

    videoWrapper.appendChild(videoElem);

    // Информация и кнопки
    const infoDiv = document.createElement('div');
    infoDiv.className = 'video-info';

    infoDiv.innerHTML = `
        <div class="video-author">👤 ${authorName}</div>
        ${video.description ? `<div class="video-desc">${video.description}</div>` : ''}
        <div class="video-stats">
            <span>👁 ${video.views || 0}</span>
            <span>❤️ ${video.likes || 0}</span>
        </div>
        <div class="video-actions">
            <button class="action-btn ${video.liked ? 'liked' : ''}" data-action="like" data-id="${video.id}">
                ${video.liked ? '❤️' : '🤍'}
                <span>Like</span>
            </button>
            <button class="action-btn ${video.bookmarked ? 'bookmarked' : ''}" data-action="bookmark" data-id="${video.id}">
                ${video.bookmarked ? '📑' : '🔖'}
                <span>Save</span>
            </button>
            <button class="action-btn" data-action="next" data-id="${video.id}">
                ▶️
                <span>Next</span>
            </button>
        </div>
    `;

    card.appendChild(videoWrapper);
    card.appendChild(infoDiv);

    // Клик по видео — play/pause
    videoElem.addEventListener('click', () => {
        if (videoElem.paused) {
            videoElem.play();
        } else {
            videoElem.pause();
        }
    });

    // Action buttons
    card.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            const videoId = btn.dataset.id;

            if (action === 'next') {
                showNextVideo();
                return;
            }

            try {
                let endpoint = '';
                if (action === 'like') {
                    endpoint = `/videos/${videoId}/like?telegram_id=${TELEGRAM_ID}`;
                } else if (action === 'bookmark') {
                    endpoint = `/videos/${videoId}/bookmark?telegram_id=${TELEGRAM_ID}`;
                }
                const response = await fetch(`${API_BASE}${endpoint}`, { method: 'POST' });
                const data = await response.json();

                // Optimistic UI update
                if (action === 'like') {
                    video.liked = data.liked;
                    if (data.liked) {
                        video.likes = (video.likes || 0) + 1;
                    } else {
                        video.likes = Math.max(0, (video.likes || 0) - 1);
                    }
                    btn.classList.toggle('liked', data.liked);
                    btn.innerHTML = `${data.liked ? '❤️' : '🤍'}<span>Like</span>`;
                    updateStatsDisplay();
                } else if (action === 'bookmark') {
                    video.bookmarked = data.bookmarked;
                    btn.classList.toggle('bookmarked', data.bookmarked);
                    btn.innerHTML = `${data.bookmarked ? '📑' : '🔖'}<span>Save</span>`;
                }
            } catch (err) {
                console.log('Action:', action, 'Video:', videoId, 'Error:', err);
            }
        });
    });

    return card;
}

function updateStatsDisplay() {
    const video = currentVideos[currentVideoIndex];
    if (!video) return;
    const card = videoContainer.querySelector('.video-card');
    if (card) {
        const stats = card.querySelector('.video-stats');
        if (stats) {
            stats.innerHTML = `
                <span>👁 ${video.views || 0}</span>
                <span>❤️ ${video.likes || 0}</span>
            `;
        }
    }
}

function showNextVideo() {
    if (currentVideoIndex < currentVideos.length - 1) {
        const cards = videoContainer.querySelectorAll('.video-card');
        if (cards[currentVideoIndex]) {
            cards[currentVideoIndex].style.display = 'none';
            // Pause video
            const oldVideo = cards[currentVideoIndex].querySelector('video');
            if (oldVideo) oldVideo.pause();
        }
        currentVideoIndex++;
        if (cards[currentVideoIndex]) {
            cards[currentVideoIndex].style.display = 'flex';
            const video = cards[currentVideoIndex].querySelector('video');
            if (video) video.play();
        }
    } else {
        loadVideos(); // reload
    }
}

// Load videos for feed
async function loadVideos() {
    videoContainer.innerHTML = '<div class="loading"></div>';

    try {
        const response = await fetch(`${API_BASE}/videos?limit=20`);
        const data = await response.json();
        currentVideos = data.videos || [];
    } catch (err) {
        console.log('Failed to load videos:', err);
        currentVideos = [];
    }

    videoContainer.innerHTML = '';
    if (currentVideos.length === 0) {
        videoContainer.innerHTML = '<p class="empty-msg">Пока нет видео</p>';
        return;
    }

    currentVideoIndex = 0;
    currentVideos.forEach((video, i) => {
        const card = createVideoCard(video, i);
        videoContainer.appendChild(card);
    });
}

// Load profile
async function loadProfile() {
    document.getElementById('profile-name').textContent = FULL_NAME;
    document.getElementById('profile-bio').textContent = 'CircleTok пользователь';

    try {
        const response = await fetch(`${API_BASE}/user/${TELEGRAM_ID}/videos`);
        const data = await response.json();
        const videos = data.videos || [];

        const statsResp = await fetch(`${API_BASE}/user/${TELEGRAM_ID}/bookmarks`);
        const bookmarksData = await statsResp.json();
        const bookmarks = bookmarksData.videos || [];

        document.getElementById('stat-videos').textContent = videos.length;
        document.getElementById('stat-likes').textContent = '—';
        document.getElementById('stat-bookmarks').textContent = bookmarks.length;
    } catch (err) {
        console.log('Failed to load profile:', err);
        document.getElementById('stat-videos').textContent = '0';
        document.getElementById('stat-likes').textContent = '0';
        document.getElementById('stat-bookmarks').textContent = '0';
    }
}

// Load bookmarks
async function loadBookmarks() {
    const list = document.getElementById('bookmarks-list');
    const empty = document.getElementById('bookmarks-empty');
    list.innerHTML = '';
    empty.style.display = 'block';

    try {
        const response = await fetch(`${API_BASE}/user/${TELEGRAM_ID}/bookmarks`);
        const data = await response.json();
        const bookmarks = data.videos || [];

        if (bookmarks.length > 0) {
            empty.style.display = 'none';
            bookmarks.forEach(video => {
                const item = document.createElement('div');
                item.className = 'bookmark-item';
                item.innerHTML = `
                    <video src="${video.file_url}" loop playsinline muted></video>
                    <div class="bookmark-info">
                        <div>👤 ${video.author_name}</div>
                        <div>❤️ ${video.likes}</div>
                    </div>
                `;
                list.appendChild(item);
            });
        }
    } catch (err) {
        console.log('Failed to load bookmarks:', err);
    }
}

// Init
tg.ready();
loadVideos();

// Handle dark theme
if (tg.colorScheme === 'dark') {
    document.documentElement.style.setProperty('--bg', '#0a0a0f');
} else {
    document.documentElement.style.setProperty('--bg', '#1a1a2e');
}