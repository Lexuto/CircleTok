// Получаем данные пользователя из Telegram
const tg = window.Telegram.WebApp;
const user = tg.initDataUnsafe?.user || { id: Date.now(), username: 'user', first_name: 'User' };

// API URL (замени на свой URL в Render)
const API_URL = 'https://circletok.onrender.com/api';

// Глобальные переменные
let currentFeed = [];
let mediaRecorder = null;
let recordedChunks = [];
let recordingStream = null;
let recordingTimer = null;
let recordingSeconds = 0;
let currentUserId = user.id.toString();

// Инициализация
tg.expand();
tg.ready();

// Показ уведомления
function showMessage(title, message, isError = false) {
    const notification = document.createElement('div');
    notification.className = `notification ${isError ? 'error' : 'success'}`;
    notification.innerHTML = `
        <div class="notification-title">${title}</div>
        <div class="notification-message">${message}</div>
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.classList.add('show'), 10);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 2500);
}

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
        document.getElementById('username').innerText = user.first_name || 'User';
    } catch (error) {
        console.error('Registration error:', error);
    }
}

// Загрузка ленты
async function loadFeed(includeAdult = false) {
    const content = document.getElementById('content');
    content.innerHTML = '<div class="loading">⏳ Загрузка...</div>';
    
    try {
        const response = await fetch(`${API_URL}/feed?adult=${includeAdult}`);
        const videos = await response.json();
        currentFeed = videos;
        renderFeed();
    } catch (error) {
        console.error('Feed error:', error);
        content.innerHTML = '<div class="error">❌ Не удалось загрузить ленту</div>';
    }
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
                        ${video.file_id ? `
                            <video class="video-player" playsinline muted loop>
                                <source src="tg://video_note?file_id=${video.file_id}" type="video/mp4">
                            </video>
                        ` : `
                            <div class="video-placeholder">🎬 Видео загружается...</div>
                        `}
                        <div class="video-overlay">
                            <div class="video-stats">
                                <button class="like-btn" onclick="window.likeVideo(${video.id})">
                                    ❤️ <span>${video.likes_count || 0}</span>
                                </button>
                            </div>
                            <div class="video-info">
                                <span class="username">@${video.username || 'user'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    // Настройка автовоспроизведения
    const observers = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const video = entry.target.querySelector('video');
            if (video) {
                if (entry.isIntersecting) {
                    video.play().catch(e => console.log('Autoplay blocked'));
                } else {
                    video.pause();
                }
            }
        });
    }, { threshold: 0.5 });
    
    document.querySelectorAll('.video-card').forEach(card => observers.observe(card));
}

// Лайк
window.likeVideo = async (videoId) => {
    showMessage('❤️', 'Лайк поставлен!');
};

// Переключение вкладок
window.switchTab = function(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tab) btn.classList.add('active');
    });
    
    switch(tab) {
        case 'feed':
            loadFeed(false);
            break;
        case 'adult':
            loadFeed(true);
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

// Избранное
async function loadFavorites() {
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">📁</div>
            <h3>Избранное пусто</h3>
            <p>Сохраняй понравившиеся видео</p>
        </div>
    `;
}

// Профиль
async function loadProfile() {
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="profile-container">
            <div class="profile-header">
                <div class="profile-avatar">${(user.first_name?.[0] || 'U')}</div>
                <h2>${user.first_name || 'User'}</h2>
                <p class="username">@${user.username || `user_${currentUserId}`}</p>
                <div class="profile-stats">
                    <div class="stat"><span class="stat-value">0</span><span class="stat-label">видео</span></div>
                    <div class="stat"><span class="stat-value">0</span><span class="stat-label">лайков</span></div>
                </div>
            </div>
        </div>
    `;
}

// Интерфейс загрузки
function showUploadInterface() {
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="upload-container">
            <h2>📹 Создать кружок</h2>
            <div class="upload-options">
                <button class="btn-primary" onclick="window.recordVideo()">🎥 Записать кружок</button>
                <button class="btn-secondary" onclick="window.uploadFromGallery()">📁 Загрузить из галереи</button>
            </div>
            <div id="previewContainer" class="preview-container hidden"></div>
            <div class="upload-tips">
                <h4>💡 Советы:</h4>
                <ul><li>Максимальная длина: 60 секунд</li><li>После загрузки видео уйдёт на модерацию</li></ul>
            </div>
        </div>
    `;
}

// Запись видео
window.recordVideo = async function() {
    if (mediaRecorder) stopRecording();
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 640 }, audio: true });
        recordingStream = stream;
        
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.muted = true;
        
        const container = document.getElementById('previewContainer');
        container.innerHTML = '';
        container.appendChild(video);
        container.classList.remove('hidden');
        
        const controls = document.createElement('div');
        controls.className = 'record-controls';
        controls.innerHTML = `
            <div class="timer">0:00</div>
            <div class="progress-bar"><div class="progress-fill"></div></div>
            <div class="record-buttons">
                <button id="stopRecordBtn" class="btn-stop">⏹️ Остановить</button>
                <button id="cancelRecordBtn" class="btn-cancel">❌ Отмена</button>
            </div>
        `;
        container.appendChild(controls);
        
        mediaRecorder = new MediaRecorder(stream);
        recordedChunks = [];
        
        mediaRecorder.ondataavailable = (e) => e.data.size && recordedChunks.push(e.data);
        mediaRecorder.onstop = () => {
            if (recordedChunks.length) {
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
            controls.querySelector('.timer').textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
            controls.querySelector('.progress-fill').style.width = `${Math.min((recordingSeconds / 60) * 100, 100)}%`;
            if (recordingSeconds >= 60) stopRecording();
        }, 1000);
        
        document.getElementById('stopRecordBtn').onclick = () => stopRecording();
        document.getElementById('cancelRecordBtn').onclick = () => cancelRecording();
        
    } catch (error) {
        showMessage('❌ Ошибка', 'Нет доступа к камере', true);
    }
};

function stopRecording() {
    if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
    if (recordingTimer) clearInterval(recordingTimer);
    if (recordingStream) recordingStream.getTracks().forEach(t => t.stop());
    recordingTimer = null;
    recordingStream = null;
}

function cancelRecording() {
    if (mediaRecorder) mediaRecorder.onstop = null;
    stopRecording();
    recordedChunks = [];
    document.getElementById('previewContainer').classList.add('hidden');
    document.getElementById('previewContainer').innerHTML = '';
}

function showPreviewAndConfirm(blob) {
    const url = URL.createObjectURL(blob);
    const container = document.getElementById('previewContainer');
    container.innerHTML = `
        <div class="preview-wrapper">
            <video src="${url}" controls autoplay loop></video>
            <div class="preview-buttons">
                <button class="btn-primary" onclick="window.confirmUpload('${url}')">✅ Отправить</button>
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
    document.getElementById('previewContainer').classList.add('hidden');
    document.getElementById('previewContainer').innerHTML = '';
    window.recordVideo();
};

window.uploadFromGallery = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file.size > 50 * 1024 * 1024) {
            showMessage('❌ Ошибка', 'Видео > 50 МБ', true);
            return;
        }
        await uploadVideo(file);
    };
    input.click();
};

async function uploadVideo(file) {
    showMessage('📤', 'Загрузка...');
    const formData = new FormData();
    formData.append('video', file);
    formData.append('user_telegram_id', currentUserId);
    
    try {
        const response = await fetch(`${API_URL}/upload`, { method: 'POST', body: formData });
        const result = await response.json();
        if (result.success) {
            showMessage('✅', 'Видео на модерации');
            setTimeout(() => window.switchTab('feed'), 1500);
        } else throw new Error(result.error);
    } catch (error) {
        showMessage('❌ Ошибка', 'Не удалось загрузить', true);
    }
}

// Запуск
registerUser();
setTimeout(() => window.switchTab('feed'), 100);
