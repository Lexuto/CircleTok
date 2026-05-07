// Получаем данные пользователя из Telegram
const tg = window.Telegram.WebApp;
const user = tg.initDataUnsafe?.user || { id: 123456, username: 'user', first_name: 'User' };

// API URL (замени на свой при деплое)
const API_URL = 'https://circletok.onrender.com/api';

// Глобальные переменные
let currentTab = 'feed';
let currentFeed = [];
let currentPage = 0;
let isLoading = false;
let includeAdult = false;
let currentUserId = user.id.toString();

// Переменные для записи
let mediaRecorder = null;
let recordedChunks = [];
let recordingStream = null;
let recordingTimer = null;
let recordingSeconds = 0;

// Инициализация
tg.expand();
tg.ready();

// Регистрация пользователя
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
        const nameElement = document.getElementById('username');
        if (nameElement) nameElement.innerText = user.first_name || 'User';
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
    if (!content) return;
    
    if (currentFeed.length === 0) {
        content.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📹</div>
                <h3>Пока нет видео</h3>
                <p>Будь первым, кто загрузит кружок!</p>
                <button class="btn-primary" onclick="window.switchTab('upload')">➕ Создать кружок</button>
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
                            src="${video.video_url || '#'}" 
                            preload="metadata"
                            playsinline
                            muted
                            loop
                        ></video>
                        <div class="video-overlay">
                            <div class="video-stats">
                                <button class="like-btn" onclick="window.toggleLike(${video.id})">
                                    ❤️ <span class="likes-count">${video.likes_count || 0}</span>
                                </button>
                                <button class="favorite-btn" onclick="window.toggleFavorite(${video.id})">
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
    
    setupVideoObserver();
}

// Настройка автовоспроизведения
function setupVideoObserver() {
    const videos = document.querySelectorAll('.video-player');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const video = entry.target;
            if (entry.isIntersecting) {
                video.play().catch(e => console.log('Autoplay error:', e));
            } else {
                video.pause();
            }
        });
    }, { threshold: 0.5 });
    
    videos.forEach(video => observer.observe(video));
}

// Лайк
window.toggleLike = async function(videoId) {
    console.log('Like:', videoId);
    tg.showPopup({
        title: 'Функция в разработке',
        message: 'Лайки появятся после подключения Mini App',
        buttons: [{ type: 'ok' }]
    });
};

// Избранное
window.toggleFavorite = async function(videoId) {
    console.log('Favorite:', videoId);
    tg.showPopup({
        title: 'Функция в разработке',
        message: 'Избранное появится после подключения Mini App',
        buttons: [{ type: 'ok' }]
    });
};

// Загрузка избранного
async function loadFavorites() {
    showLoading();
    setTimeout(() => {
        showError('Функция в разработке');
    }, 500);
}

// Загрузка профиля
async function loadProfile() {
    const content = document.getElementById('content');
    if (!content) return;
    
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
                        <span class="stat-value">0</span>
                        <span class="stat-label">видео</span>
                    </div>
                    <div class="stat">
                        <span class="stat-value">0</span>
                        <span class="stat-label">лайков</span>
                    </div>
                    <div class="stat">
                        <span class="stat-value">0</span>
                        <span class="stat-label">подписчиков</span>
                    </div>
                </div>
                <button class="btn-secondary" onclick="window.editProfile()">✏️ Редактировать профиль</button>
            </div>
        </div>
    `;
}

window.editProfile = function() {
    tg.showPopup({
        title: 'Редактирование',
        message: 'Функция в разработке',
        buttons: [{ type: 'ok' }]
    });
};

// Интерфейс загрузки
function showUploadInterface() {
    const content = document.getElementById('content');
    if (!content) return;
    
    content.innerHTML = `
        <div class="upload-container">
            <h2>📹 Создать кружок</h2>
            <div class="upload-options">
                <button class="btn-primary" onclick="window.recordVideo()">
                    🎥 Записать кружок
                </button>
                <button class="btn-secondary" onclick="window.uploadFromGallery()">
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

// Запись видео
window.recordVideo = async function() {
    stopRecording();
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 640 },
                height: { ideal: 640 },
                aspectRatio: 1
            }, 
            audio: true 
        });
        
        recordingStream = stream;
        
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        
        const container = document.getElementById('previewContainer');
        container.innerHTML = '';
        container.appendChild(video);
        container.classList.remove('hidden');
        
        const controls = document.createElement('div');
        controls.className = 'record-controls';
        controls.innerHTML = `
            <div class="timer">0:00</div>
            <div class="progress-bar">
                <div class="progress-fill"></div>
            </div>
            <div class="record-buttons">
                <button id="stopRecordBtn" class="btn-stop">⏹️ Остановить</button>
                <button id="cancelRecordBtn" class="btn-cancel">❌ Отмена</button>
            </div>
        `;
        container.appendChild(controls);
        
        mediaRecorder = new MediaRecorder(stream);
        recordedChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };
        
        mediaRecorder.onstop = () => {
            if (recordingTimer) {
                clearInterval(recordingTimer);
                recordingTimer = null;
            }
            if (recordedChunks.length > 0) {
                const blob = new Blob(recordedChunks, { type: 'video/mp4' });
                showPreviewAndConfirm(blob);
            }
        };
        
        mediaRecorder.start(1000);
        recordingSeconds = 0;
        
        recordingTimer = setInterval(() => {
            recordingSeconds++;
            const mins = Math.floor(recordingSeconds / 60);
            const secs = recordingSeconds % 60;
            const timerEl = controls.querySelector('.timer');
            if (timerEl) timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
            
            const progressFill = controls.querySelector('.progress-fill');
            if (progressFill) {
                const percent = (recordingSeconds / 60) * 100;
                progressFill.style.width = `${Math.min(percent, 100)}%`;
            }
            
            if (recordingSeconds >= 60) {
                stopRecording();
            }
        }, 1000);
        
        document.getElementById('stopRecordBtn').onclick = () => stopRecording();
        document.getElementById('cancelRecordBtn').onclick = () => cancelRecording();
        
    } catch (error) {
        console.error('Camera error:', error);
        tg.showPopup({
            title: 'Ошибка',
            message: 'Не удалось получить доступ к камере',
            buttons: [{ type: 'ok' }]
        });
    }
};

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    }
    if (recordingTimer) {
        clearInterval(recordingTimer);
        recordingTimer = null;
    }
    if (recordingStream) {
        recordingStream.getTracks().forEach(track => track.stop());
        recordingStream = null;
    }
}

function cancelRecording() {
    if (mediaRecorder) mediaRecorder.onstop = null;
    stopRecording();
    recordedChunks = [];
    const container = document.getElementById('previewContainer');
    container.classList.add('hidden');
    container.innerHTML = '';
}

function showPreviewAndConfirm(blob) {
    const videoURL = URL.createObjectURL(blob);
    const container = document.getElementById('previewContainer');
    
    container.innerHTML = `
        <div class="preview-wrapper">
            <video src="${videoURL}" controls autoplay loop></video>
            <div class="preview-buttons">
                <button class="btn-primary" onclick="window.confirmUpload('${videoURL}')">✅ Отправить</button>
                <button class="btn-secondary" onclick="window.retakeVideo()">🔄 Переснять</button>
            </div>
        </div>
    `;
}

window.confirmUpload = async function(videoURL) {
    const response = await fetch(videoURL);
    const blob = await response.blob();
    const file = new File([blob], `circle_${Date.now()}.mp4`, { type: 'video/mp4' });
    await uploadVideo(file);
    URL.revokeObjectURL(videoURL);
    document.getElementById('previewContainer').classList.add('hidden');
};

window.retakeVideo = function() {
    const container = document.getElementById('previewContainer');
    container.classList.add('hidden');
    container.innerHTML = '';
    window.recordVideo();
};

// Загрузка из галереи
window.uploadFromGallery = function() {
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
};

// Загрузка на сервер
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
                message: 'Видео отправлено на модерацию',
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
            message: 'Не удалось загрузить видео',
            buttons: [{ type: 'ok' }]
        });
    }
}

// Переключение вкладок
window.switchTab = function(tab) {
    currentTab = tab;
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tab) {
            btn.classList.add('active');
        }
    });
    
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
};

// Вспомогательные функции
function showLoading() {
    const content = document.getElementById('content');
    if (content) content.innerHTML = '<div class="loading">⏳ Загрузка...</div>';
}

function showError(message) {
    const content = document.getElementById('content');
    if (content) content.innerHTML = `<div class="error">❌ ${message}</div>`;
}

// Запуск
registerUser();
window.switchTab = window.switchTab.bind(window);
window.toggleLike = window.toggleLike.bind(window);
window.toggleFavorite = window.toggleFavorite.bind(window);
window.editProfile = window.editProfile.bind(window);
window.recordVideo = window.recordVideo.bind(window);
window.uploadFromGallery = window.uploadFromGallery.bind(window);
window.confirmUpload = window.confirmUpload.bind(window);
window.retakeVideo = window.retakeVideo.bind(window);

switchTab('feed');
