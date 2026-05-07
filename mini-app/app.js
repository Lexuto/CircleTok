// CircleTok Mini App
const tg = window.Telegram.WebApp;
tg.expand();

let currentVideos = [];
let currentVideoIndex = 0;
let currentView = 'feed';

// API endpoint (should be configured)
const API_BASE = 'https://your-api.com';

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

// Render a video card
function createVideoCard(video, index) {
    const card = document.createElement('div');
    card.className = 'video-card';
    card.style.display = index === 0 ? 'block' : 'none';

    const authorName = video.author_name || 'User';

    card.innerHTML = `
        <video src="${video.file_id}" loop playsinline muted autoplay></video>
        <div class="video-info">
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
        </div>
    `;

    // Video click to play/pause
    const videoElem = card.querySelector('video');
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
                const response = await tg.callApi('sendData', JSON.stringify({
                    action: action,
                    video_id: parseInt(videoId)
                }));
            } catch (err) {
                console.log('Action:', action, 'Video:', videoId);
            }

            // Optimistic UI update
            if (action === 'like') {
                video.liked = !video.liked;
                if (video.liked) {
                    video.likes = (video.likes || 0) + 1;
                } else {
                    video.likes = Math.max(0, (video.likes || 0) - 1);
                }
                btn.classList.toggle('liked');
                btn.innerHTML = `${video.liked ? '❤️' : '🤍'}<span>Like</span>`;
                updateStatsDisplay();
            } else if (action === 'bookmark') {
                video.bookmarked = !video.bookmarked;
                btn.classList.toggle('bookmarked');
                btn.innerHTML = `${video.bookmarked ? '📑' : '🔖'}<span>Save</span>`;
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
        }
        currentVideoIndex++;
        if (cards[currentVideoIndex]) {
            cards[currentVideoIndex].style.display = 'block';
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

    // Fallback demo data
    currentVideos = [
        {
            id: 1,
            file_id: '',
            description: 'Пример видео кружка',
            author_name: 'User1',
            views: 42,
            likes: 7,
            liked: false,
            bookmarked: false
        },
    ];

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
    document.getElementById('profile-name').textContent = tg.initDataUnsafe?.user?.first_name || 'Пользователь';
    document.getElementById('profile-bio').textContent = 'CircleTok пользователь';

    document.getElementById('stat-videos').textContent = '0';
    document.getElementById('stat-likes').textContent = '0';
    document.getElementById('stat-bookmarks').textContent = '0';
}

// Load bookmarks
async function loadBookmarks() {
    const list = document.getElementById('bookmarks-list');
    const empty = document.getElementById('bookmarks-empty');
    list.innerHTML = '';
    empty.style.display = 'block';
}

// Init
tg.ready();
loadVideos();
switchView('feed');

// Handle theme
if (tg.colorScheme === 'dark') {
    document.documentElement.style.setProperty('--bg', '#0a0a0f');
} else {
    document.documentElement.style.setProperty('--bg', '#1a1a2e');
}