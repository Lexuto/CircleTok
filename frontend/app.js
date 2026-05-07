// Глобальные переменные для записи
let mediaRecorder = null;
let recordedChunks = [];
let recordingStream = null;
let recordingTimer = null;
let recordingSeconds = 0;

// Запись видео через камеру
async function recordVideo() {
    // Останавливаем предыдущую запись, если была
    stopRecording();
    
    try {
        // Запрашиваем доступ к камере и микрофону
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 640 },
                height: { ideal: 640 },
                aspectRatio: 1
            }, 
            audio: true 
        });
        
        recordingStream = stream;
        
        // Создаём preview видео
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        
        const container = document.getElementById('previewContainer');
        container.innerHTML = '';
        container.appendChild(video);
        container.classList.remove('hidden');
        
        // Создаём кнопки управления
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
        
        // Инициализируем MediaRecorder
        mediaRecorder = new MediaRecorder(stream, {
            mimeType: MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm'
        });
        
        recordedChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };
        
        mediaRecorder.onstop = async () => {
            // Останавливаем таймер
            if (recordingTimer) {
                clearInterval(recordingTimer);
                recordingTimer = null;
            }
            
            if (recordedChunks.length === 0) {
                console.log('Нет записанных данных');
                return;
            }
            
            // Создаём blob из записанных данных
            const blob = new Blob(recordedChunks, { 
                type: mediaRecorder.mimeType 
            });
            
            // Показываем превью перед отправкой
            showPreviewAndConfirm(blob);
        };
        
        // Запускаем запись
        mediaRecorder.start(1000); // Собираем данные каждую секунду
        recordingSeconds = 0;
        
        // Обновляем таймер
        recordingTimer = setInterval(() => {
            recordingSeconds++;
            const minutes = Math.floor(recordingSeconds / 60);
            const seconds = recordingSeconds % 60;
            const timerElement = controls.querySelector('.timer');
            if (timerElement) {
                timerElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
            
            // Обновляем прогресс-бар (максимум 60 секунд)
            const progressFill = controls.querySelector('.progress-fill');
            if (progressFill) {
                const percent = (recordingSeconds / 60) * 100;
                progressFill.style.width = `${Math.min(percent, 100)}%`;
            }
            
            // Автоматическая остановка через 60 секунд
            if (recordingSeconds >= 60) {
                stopRecording();
            }
        }, 1000);
        
        // Кнопка остановки
        document.getElementById('stopRecordBtn').addEventListener('click', () => {
            stopRecording();
        });
        
        // Кнопка отмены
        document.getElementById('cancelRecordBtn').addEventListener('click', () => {
            cancelRecording();
        });
        
    } catch (error) {
        console.error('Camera error:', error);
        tg.showPopup({
            title: 'Ошибка',
            message: 'Не удалось получить доступ к камере. Проверьте разрешения.',
            buttons: [{ type: 'ok' }]
        });
    }
}

// Остановка записи
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

// Отмена записи
function cancelRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.onstop = null; // Предотвращаем обработку
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
    
    recordedChunks = [];
    mediaRecorder = null;
    
    // Скрываем превью
    const container = document.getElementById('previewContainer');
    container.classList.add('hidden');
    container.innerHTML = '';
    
    tg.showPopup({
        title: 'Отмена',
        message: 'Запись отменена',
        buttons: [{ type: 'ok' }]
    });
}

// Показать превью перед отправкой
function showPreviewAndConfirm(blob) {
    const videoURL = URL.createObjectURL(blob);
    const container = document.getElementById('previewContainer');
    
    container.innerHTML = `
        <div class="preview-wrapper">
            <video src="${videoURL}" controls autoplay loop></video>
            <div class="preview-buttons">
                <button class="btn-primary" onclick="confirmUpload('${videoURL}')">✅ Отправить</button>
                <button class="btn-secondary" onclick="retakeVideo()">🔄 Переснять</button>
            </div>
        </div>
    `;
    
    recordingStream = null;
    mediaRecorder = null;
}

// Подтверждение загрузки
async function confirmUpload(videoURL) {
    // Получаем blob из URL
    const response = await fetch(videoURL);
    const blob = await response.blob();
    
    // Создаём файл
    const file = new File([blob], `circle_${Date.now()}.mp4`, { type: 'video/mp4' });
    
    // Загружаем
    await uploadVideo(file);
    
    // Очищаем
    URL.revokeObjectURL(videoURL);
    const container = document.getElementById('previewContainer');
    container.classList.add('hidden');
}

// Переснять видео
function retakeVideo() {
    // Очищаем
    if (recordingStream) {
        recordingStream.getTracks().forEach(track => track.stop());
        recordingStream = null;
    }
    
    const container = document.getElementById('previewContainer');
    container.classList.add('hidden');
    container.innerHTML = '';
    
    // Начинаем запись заново
    recordVideo();
}
