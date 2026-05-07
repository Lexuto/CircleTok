// Получаем данные пользователя из Telegram
const tg = window.Telegram.WebApp;
const user = tg.initDataUnsafe?.user || { id: 123456, username: 'user', first_name: 'User' };

// API URL (замени на свой при деплое)
const API_URL = 'http://localhost:3000/api';

// Глобальное состояние
let currentTab = 'feed';
let currentFeed = [];
let currentPage = 0;
let isLoading = false;
let includeAdult = false;
let currentUserId = user.id.toString();

// Инициализация приложения
tg.expand(); // Растягиваем на весь экран
tg.ready();

// Регистрируем пользователя
async function registerUser() {
    try {
        await fetch(`${API_URL}/user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                telegram_id: currentUserId,
                username: user.username || `user_${currentUserId}`,
                first_name: user.first_name || 'Аноним'
            })
        });
        document.getElementById('username').innerText = user.first_name || 'User';
    } catch (error) {
        console.error('Registration error:', error);
    }
}

// Загрузка ленты
async function loadFeed(loadMore = false) {
    if (isLoading) return;
    isLoading = true;
    
    if (!loadMore) {
        currentPage = 0;
        currentFeed = [];
        showLoading();
    }
    
    try {
        const response = await fetch(`${API_URL}/feed?page=${currentPage}&include_adult=${includeAdult}`);
        const videos = await response.json();
        
        if (loadMore) {
            currentFeed = [...currentFeed, ...videos];
        } else {
            currentFeed = videos;
        }
        
        renderFeed();
        currentPage++;
    } catch (error) {
        console.error('Feed error:', error);
        showError('Не удалось загрузить ленту');
    }
    
    isLoading = false;
}

// Рендер ленты
function renderFeed() {
    const content = document.getElementById('content');
    
    if (currentFeed.length === 0) {
        content.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📹</div>
                <h3>Пока нет видео</h3>
                <p>Будь первым, кто загрузит кружок!</p>
                <button class="btn-primary" onclick="switchTab('upload')">➕ Создать кружок</button>
            </div>
        `;
        return;
    }
    
    content.innerHTML = `
        <div class="feed-container">
            ${currentFeed.map(video => `
                <div class="video-card" data-video-id="${video.id}">
                    <div class="video-wrapper">
                        <video 
                            class="video-player" 
                            src="${video.video_url}" 
                            preload="metadata"
                            playsinline
                            muted
                            loop
                        ></video>
                        <div class="video-overlay">
                            <div class="video-stats">
                                <button class="like-btn ${video.is_liked ? 'liked' : ''}" onclick="toggleLike(${video.id})">
                                    ❤️ <span class="likes-count">${video.likes_count || 0}</span>
                                </button>
                                <button class="favorite-btn ${video.is_favorited ? 'favorited' : ''}" onclick="toggleFavorite(${video.id})">
                                    📁
                                </button>
                            </div>
                            <div class="video-info">
                                <span class="username">@${video.username || 'user'}</span>
                                <span class="views">👁 ${video.views_count || 0}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    // Добавляем обработчики для видео (автовоспроизведение при скролле)
    setupVideoObserver();
}

// Настройка автовоспроизведения
function setupVideoObserver() {
    const videos = document.querySelectorAll('.video-player');
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const video = entry.target;
            if (entry.isIntersecting) {
                video.play().catch(e => console.log('Autoplay prevented:', e));
                // Добавляем просмотр
                addView(video.closest('.video-card').dataset.videoId);
            } else {
                video.pause();
            }
        });
    }, { threshold: 0.5 });
    
    videos.forEach(video => observer.observe(video));
}

// Добавление просмотра
async function addView(videoId) {
    try {
        await fetch(`${API_URL}/view`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ video_id: videoId })
        });
    } catch (error) {
        console.error('View error:', error);
    }
}

// Лайк/дизлайк
async function toggleLike(videoId) {
    const video = currentFeed.find(v => v.id === videoId);
    if (!video) return;
    
    const action = video.is_liked ? 'unlike' : 'like';
    
    try {
        await fetch(`${API_URL}/like`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_telegram_id: currentUserId,
                video_id: videoId,
                action: action
            })
        });
        
        video.is_liked = !video.is_liked;
        video.likes_count += video.is_liked ? 1 : -1;
        renderFeed(); // Перерендер
    } catch (error) {
        console.error('Like error:', error);
    }
}

// Избранное
async function toggleFavorite(videoId) {
    const video = currentFeed.find(v => v.id === videoId);
    if (!video) return;
    
    const action = video.is_favorited ? 'remove' : 'add';
    
    try {
        await fetch(`${API_URL}/favorite`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_telegram_id: currentUserId,
                video_id: videoId,
                action: action
            })
        });
        
        video.is_favorited = !video.is_favorited;
        if (currentTab === 'favorites' && action === 'remove') {
            loadFavorites(); // Перезагружаем избранное
        } else {
            renderFeed();
        }
    } catch (error) {
        console.error('Favorite error:', error);
    }
}

// Загрузка избранного
async function loadFavorites() {
    showLoading();
    try {
        const response = await fetch(`${API_URL}/favorites/${currentUserId}`);
        const favorites = await response.json();
        currentFeed = favorites;
        renderFeed();
    } catch (error) {
        console.error('Favorites error:', error);
        showError('Не удалось загрузить избранное');
    }
}

// Загрузка профиля
async function loadProfile() {
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="profile-container">
            <div class="profile-header">
                <div class="profile-avatar" id="profileAvatar">
                    ${user.first_name ? user.first_name[0] : 'U'}
                </div>
                <h2>${user.first_name || 'User'} ${user.last_name || ''}</h2>
                <p class="username">@${user.username || `user_${currentUserId}`}</p>
                <div class="profile-stats">
                    <div class="stat">
                        <span class="stat-value" id="videoCount">0</span>
                        <span class="stat-label">видео</span>
                    </div>
                    <div class="stat">
                        <span class="stat-value" id="totalLikes">0</span>
                        <span class="stat-label">лайков</span>
                    </div>
                    <div class="stat">
                        <span class="stat-value" id="followers">0</span>
                        <span class="stat-label">подписчиков</span>
                    </div>
                </div>
                <button class="btn-secondary" onclick="editProfile()">✏️ Редактировать профиль</button>
            </div>
            <div class="profile-videos">
                <h3>Мои видео</h3>
                <div id="userVideos" class="videos-grid"></div>
            </div>
        </div>
    `;
    
    // Загружаем видео пользователя
    await loadUserVideos();
}

// Загрузка видео пользователя
async function loadUserVideos() {
    try {
        const response = await fetch(`${API_URL}/user/videos/${currentUserId}`);
        const videos = await response.json();
        
        const container = document.getElementById('userVideos');
        if (videos.length === 0) {
            container.innerHTML = '<p class="empty-text">У вас пока нет видео</p>';
            return;
        }
        
        container.innerHTML = videos.map(video => `
            <div class="video-thumb" onclick="playVideo(${video.id})">
                <video src="${video.video_url}" preload="metadata"></video>
                <div class="thumb-overlay">
                    <span>❤️ ${video.likes_count || 0}</span>
                </div>
            </div>
        `).join('');
        
        document.getElementById('videoCount').innerText = videos.length;
        const totalLikes = videos.reduce((sum, v) => sum + (v.likes_count || 0), 0);
        document.getElementById('totalLikes').innerText = totalLikes;
    } catch (error) {
        console.error('User videos error:', error);
    }
}

// Редактирование профиля
function editProfile() {
    const newAvatar = prompt('Введите URL аватара (или оставьте пустым):');
    if (newAvatar) {
        localStorage.setItem('avatar', newAvatar);
        document.getElementById('profileAvatar').style.backgroundImage = `url(${newAvatar})`;
        document.getElementById('profileAvatar').innerText = '';
        tg.showPopup({
            title: 'Успех!',
            message: 'Аватар обновлён',
            buttons: [{ type: 'ok' }]
        });
    }
}

// Запись/загрузка видео
function showUploadInterface() {
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="upload-container">
            <h2>📹 Создать кружок</h2>
            <div class="upload-options">
                <button class="btn-primary" onclick="recordVideo()">
                    🎥 Записать кружок
                </button>
                <button class="btn-secondary" onclick="uploadFromGallery()">
                    📁 Загрузить из галереи
                </button>
            </div>
            <div id="previewContainer" class="preview-container hidden"></div>
            <div class="upload-tips">
                <h4>💡 Советы:</h4>
                <ul>
                    <li>Максимальная длина: 60 секунд</li>
                    <li>После загрузки видео уйдёт на модерацию</li>
                    <li>18+ контент будет помечен соответствующим образом</li>
                </ul>
            </div>
        </div>
    `;
}

// Запись видео через камеру
async function recordVideo() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 640 },
                height: { ideal: 640 },
                aspectRatio: 1
            }, 
            audio: true 
        });
        
        // Создаём preview
        const video = document.createElement('video');
        video.srcObject = stream;
        video.play();
        
        const container = document.getElementById('previewContainer');
        container.innerHTML = '';
        container.appendChild(video);
        container.classList.remove('hidden');
        
        const mediaRecorder = new MediaRecorder(stream);
        const chunks = [];
        
        mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
        mediaRecorder.onstop = async () => {
            const blob = new Blob(chunks, { type: 'video/mp4' });
            await uploadVideo(blob);
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        
        // Добавляем кнопки управления
        const controls = document.createElement('div');
        controls.className = 'record-controls';
        controls.innerHTML = `
            <button onclick="this.mediaRecorder.stop()">⏹️ Остановить</button>
            <progress value="0" max="60"></progress>
        `;
        container.appendChild(controls);
        
        // Таймер
        let seconds = 0;
        const timer = setInterval(() => {
            seconds++;
            controls.querySelector('progress').value = seconds;
            if (seconds >= 60) {
                mediaRecorder.stop();
                clearInterval(timer);
            }
        }, 1000);
    } catch (error) {
        console.error('Camera error:', error);
        tg.showPopup({
            title: 'Ошибка',
            message: 'Не удалось получить доступ к камере. Проверьте разрешения.',
            buttons: [{ type: 'ok' }]
        });
    }
}

// Загрузка из галереи
function uploadFromGallery() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file.size > 50 * 1024 * 1024) {
            tg.showPopup({
                title: 'Ошибка',
                message: 'Видео слишком большое! Максимум 50 МБ',
                buttons: [{ type: 'ok' }]
            });
            return;
        }
        await uploadVideo(file);
    };
    input.click();
}

// Загрузка видео на сервер
async function uploadVideo(file) {
    tg.showPopup({
        title: 'Загрузка',
        message: 'Видео загружается...',
        buttons: [{ type: 'ok' }]
    });
    
    const formData = new FormData();
    formData.append('video', file);
    formData.append('user_telegram_id', currentUserId);
    
    try {
        const response = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            tg.showPopup({
                title: 'Успех!',
                message: 'Видео отправлено на модерацию. Мы уведомим вас о результате.',
                buttons: [{ type: 'ok' }]
            });
            switchTab('feed');
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('Upload error:', error);
        tg.showPopup({
            title: 'Ошибка',
            message: 'Не удалось загрузить видео. Попробуйте позже.',
            buttons: [{ type: 'ok' }]
        });
    }
}

// Переключение вкладок
function switchTab(tab) {
    currentTab = tab;
    
    // Обновляем активную кнопку
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tab) {
            btn.classList.add('active');
        }
    });
    
    // Загружаем контент
    switch(tab) {
        case 'feed':
            includeAdult = false;
            loadFeed();
            break;
        case 'adult':
            includeAdult = true;
            loadFeed();
            break;
        case 'favorites':
            loadFavorites();
            break;
        case 'profile':
            loadProfile();
            break;
        case 'upload':
            showUploadInterface();
            break;
    }
}

// Вспомогательные функции
function showLoading() {
    const content = document.getElementById('content');
    content.innerHTML = '<div class="loading">⏳ Загрузка...</div>';
}

function showError(message) {
    const content = document.getElementById('content');
    content.innerHTML = `<div class="error">❌ ${message}</div>`;
}

// Обработчики для вкладок
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// Запуск
registerUser();
switchTab('feed');