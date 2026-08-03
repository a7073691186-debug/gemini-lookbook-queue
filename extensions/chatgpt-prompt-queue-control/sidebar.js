/**
 * sidebar.js — 侧边栏 UI 注入与事件处理
 * 负责：注入侧边栏 HTML、绑定按钮事件、日志面板、计时器
 */

// ========== 风格中文翻译映射 ==========
const STYLE_CN_MAP = {
  'Japanese Ukiyo-e': '日本浮世绘',
  'Manga': '漫画',
  'Anime': '动漫',
  'Watercolor Illustration': '水彩插画',
  '3D Animation': '3D动画',
  'Wasteland': '废土',
  'Retro-futurism': '复古未来主义',
  'Space Opera': '太空歌剧',
  'Steampunk': '蒸汽朋克',
  'Cyberpunk': '赛博朋克',
  'Oil Painting': '油画',
  'Ethnic Art': '民族艺术',
  'Paper Quilling Artwork': '纸卷艺术',
  'Chinese Ink Painting': '中国水墨画',
  'Vintage': '复古',
  'Ivory Carving Artwork': '牙雕艺术',
  'Stained Glass Artwork': '彩色玻璃艺术',
  'Clay Artwork': '陶艺',
  'Origami Artwork': '折纸艺术',
  'Rangoli': '兰果丽',
  'Surrealism': '超现实主义',
  'Abstract Art': '抽象艺术',
  'Pointillism': '点彩画',
  'Retro Poster Style': '复古海报',
  'Minimalist Poster Style': '极简海报',
  'Sketch Drawing': '素描',
  'Op Art': '欧普艺术',
  'Doodle Art': '涂鸦艺术',
  'Constructivism': '构成主义',
  'Bauhaus': '包豪斯',
  'Renaissance': '文艺复兴',
  'Baroque Period': '巴洛克',
  'Gothic Art': '哥特艺术',
  'Victorian Period': '维多利亚时期',
};

// ========== 侧边栏 HTML 模板 ==========
const SIDEBAR_HTML = `
  <div class="gemini-sidebar-header">
    <div class="gemini-sidebar-title">🛠️ Очередь генерации изображений ChatGPT</div>
    <div class="gemini-header-actions">
      <a href="https://chatgpt.com/" target="_blank" class="gemini-link-btn" title="Открыть новый чат ChatGPT">🔗 Новый ChatGPT</a>
      <button class="gemini-collapse-btn" id="gemini-collapse-btn">▶ Свернуть</button>
    </div>
  </div>

  <div class="gemini-setting-row" style="flex-shrink:0;">
    <label for="gemini-newchat-interval">Новый чат после каждых N картинок</label>
    <input type="number" id="gemini-newchat-interval" class="gemini-setting-number" min="0" value="0" title="0 = хранить очередь в одном чате для одного ZIP" />
  </div>

  <div class="gemini-setting-row gemini-numbering-row" style="flex-shrink:0;">
    <label for="gemini-slide-counter-input">Следующий номер слайда</label>
    <div class="gemini-numbering-controls">
      <input type="number" id="gemini-slide-counter-input" class="gemini-setting-number gemini-slide-counter-input" min="1" value="1" title="Сквозная нумерация файлов: slide_001, slide_002..." />
      <button id="gemini-reset-slide-counter-btn" class="gemini-link-btn" title="Сбросить нумерацию для нового видео">↺ Сбросить</button>
    </div>
  </div>

  <div class="gemini-setting-row" style="flex-shrink:0;">
    <label for="gemini-task-interval">Интервал запуска / случайный разброс (мин)</label>
    <div style="display:flex; gap:8px; align-items:center;">
      <input type="number" id="gemini-task-interval" class="gemini-setting-number" min="0" step="0.1" value="0.2" title="Минимальный интервал после завершения предыдущей генерации" />
      <span style="color:#888; font-size:12px;">±</span>
      <input type="number" id="gemini-task-jitter" class="gemini-setting-number" min="0" step="0.1" value="0" title="Случайный разброс добавляется к интервалу каждой задачи" />
    </div>
  </div>

  <div class="gemini-setting-row" style="flex-shrink:0;">
    <label>Контроль готовности картинки</label>
    <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:6px; align-items:center;">
      <div>
        <div style="font-size:11px;color:#888;margin-bottom:2px;">Макс. ожидание, сек</div>
        <input type="number" id="gemini-wait-timeout-sec" class="gemini-setting-number" min="20" step="5" value="120" title="GPT обычно завершил изображение за ~47 сек в проверенной записи; 120 сек — безопасный предел." />
      </div>
      <div>
        <div style="font-size:11px;color:#888;margin-bottom:2px;">Пауза после, сек</div>
        <input type="number" id="gemini-settle-sec" class="gemini-setting-number" min="0" step="1" value="10" title="Пауза после появления картинки, чтобы она попала в ZIP-накопитель ChatGPT." />
      </div>
      <div>
        <div style="font-size:11px;color:#888;margin-bottom:2px;">Повторы</div>
        <input type="number" id="gemini-retry-attempts" class="gemini-setting-number" min="0" step="1" value="2" title="Сколько раз повторять промты, где картинка не попала в накопитель." />
      </div>
    </div>
  </div>

  <div class="gemini-tabs" style="flex-shrink:0;">
    <button class="gemini-tab active" data-tab="text">📝 Текст → изображение</button>
    <button class="gemini-tab" data-tab="image">🖼 Преобразование изображений</button>
  </div>

  <!-- ===== Tab 1: 文本生图 ===== -->
  <div class="gemini-tab-content active" id="gemini-tab-text">
    <div class="gemini-label">Префикс (добавляется перед каждым промтом)</div>
    <input type="text" id="gemini-prefix-input" class="gemini-input-field" placeholder="Например: сгенерируй изображение" value="Сгенерируй изображение" />

    <div class="gemini-label" style="display:flex;justify-content:space-between;align-items:center;">
      <span>Список промтов</span>
      <div class="gemini-prompt-tools-grid">
        <button id="gemini-shuffle-prompts-btn" class="gemini-link-btn" title="Перемешать текущий список">🔀 Перемешать</button>
        <button id="gemini-all-prompts-btn" class="gemini-link-btn" title="Использовать все пресеты">🌌 Все пресеты</button>
        <div id="gemini-style-select-wrapper" class="gemini-style-select-wrapper"><button id="gemini-style-select-btn" class="gemini-link-btn" title="Выбрать стили">🏷️ Выбрать стиль <span id="gemini-style-count"></span></button><div id="gemini-style-dropdown" class="gemini-style-dropdown" style="display:none;"><input type="text" id="gemini-style-search" class="gemini-style-search" placeholder="Поиск стиля..." /><div id="gemini-style-options" class="gemini-style-options"></div></div></div>
        <button id="gemini-random-style-btn" class="gemini-link-btn" title="Случайно выбрать 5 стилей">🎲 Случайные стили</button>
      </div>
    </div>
    <textarea id="gemini-prompt-input" placeholder="Вставь промты сюда, один промт на строку...&#10;Например:&#10;Shanghai Oriental Pearl Tower on a rainy day, ukiyo-e style&#10;Shanghai Oriental Pearl Tower on a rainy day, impressionist style">Shanghai Oriental Pearl Tower on a rainy day, ukiyo-e style
Shanghai Oriental Pearl Tower on a rainy day, pointillism style
Shanghai Oriental Pearl Tower on a rainy day, impressionist style</textarea>
    <div style="text-align:right;font-size:12px;margin-top:-6px;margin-bottom:8px;color:#888;">Количество: <span id="gemini-prompt-count" style="color:#8ab4f8;font-weight:bold;">0</span></div>

    <div class="gemini-label">Суффикс (добавляется после каждого промта)</div>
    <input type="text" id="gemini-suffix-input" class="gemini-input-field" placeholder="Например:高清, 8K" value="4K high quality, 16:9 aspect ratio" />

    <div id="gemini-text-btn-container">
      <div id="gemini-text-start-row" class="gemini-btn-row">
        <button id="gemini-auto-runner-btn">▶ Запустить очередь</button>
        <button id="gemini-experiment-btn" class="gemini-experiment-btn">🧪 Малый тест</button>
      </div>
      <button id="gemini-text-pause-btn" class="gemini-running-pause-btn" style="display:none;">⏸ Пауза</button>
      <div id="gemini-text-pause-actions" class="gemini-pause-actions" style="display:none;">
        <button id="gemini-text-resume-btn" class="gemini-resume-btn">▶ Продолжить</button>
        <button id="gemini-text-terminate-btn" class="gemini-terminate-btn">🛑 Остановить</button>
      </div>
    </div>
  </div>

  <!-- ===== Tab 2: 图片转换 ===== -->
  <div class="gemini-tab-content" id="gemini-tab-image">
    <div class="gemini-label">Выбери изображения (можно несколько)</div>
    <div class="gemini-image-upload-area" id="gemini-image-upload-area">
      <input type="file" id="gemini-image-file-input" multiple accept="image/*" style="display:none;" />
      <button id="gemini-image-select-btn" class="gemini-image-select-btn">📂 Выбрать изображения / перетащить папку</button>
      <span id="gemini-image-count" class="gemini-image-count">Файлы не выбраны</span>
    </div>

    <div id="gemini-image-preview" class="gemini-image-preview"></div>

    <div class="gemini-label">Промт преобразования (общий для всех изображений)</div>
    <textarea id="gemini-image-prompt" class="gemini-image-prompt-textarea" placeholder="Например:Преобразуй это изображение в кинематографичный реалистичный стиль">Преобразуй изображение выше в реалистичный фотографический стиль, как кадр с камеры
1. Сохрани композицию, расположение и размер исходного изображения
2. Сохрани причёску и стиль одежды персонажей
3. Преобразуй всех людей на изображении
4. Не живопись, не аниме</textarea>

    <div id="gemini-image-btn-container">
      <button id="gemini-image-runner-btn">▶ Запустить очередь преобразования</button>
      <div id="gemini-image-pause-actions" class="gemini-pause-actions" style="display:none;">
        <button id="gemini-image-resume-btn" class="gemini-resume-btn">▶ Продолжить</button>
        <button id="gemini-image-terminate-btn" class="gemini-terminate-btn">🛑 Остановить</button>
      </div>
    </div>
  </div>

  <button id="gemini-download-btn" class="gemini-download-main-btn" style="margin-top:10px; margin-bottom:10px; flex-shrink:0;">📥 Скачать картинки этой страницы ZIP</button>

  <div id="gemini-dashboard" class="gemini-dashboard" style="display:none; flex-shrink:0;">
    <div class="gemini-dashboard-grid">
      <div class="gemini-dashboard-row">
        <span class="gemini-dashboard-label">📋 Прогресс задач</span>
        <span id="gemini-dash-progress" class="gemini-dashboard-value">0 / 0</span>
      </div>
      <div class="gemini-dashboard-row">
        <span class="gemini-dashboard-label">🖼 Текущая задача</span>
        <span id="gemini-dash-current" class="gemini-dashboard-value gemini-dash-blue">00:00</span>
      </div>
      <div class="gemini-dashboard-row">
        <span class="gemini-dashboard-label">⏱ Общее время</span>
        <span id="gemini-dash-total" class="gemini-dashboard-value gemini-dash-orange">00:00</span>
      </div>
      <div class="gemini-dashboard-row">
        <span class="gemini-dashboard-label">📊 Среднее время</span>
        <span id="gemini-dash-average" class="gemini-dashboard-value gemini-dash-green" style="color:#34a853">00:00</span>
      </div>
    </div>
    <div class="gemini-progress-bg" style="margin-top:6px;">
      <div id="gemini-progress-fill"></div>
    </div>
  </div>

  <div class="gemini-log-container">
    <div class="gemini-label">Лог работы</div>
    <div id="gemini-log-panel"></div>
  </div>
`;

// ========== 计时器管理 ==========
let _timerInterval = null;
let _timerStartTime = null;   // 单 изображений计时
let _totalTimerStartTime = null;  // 总Задача计时

function _formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const sec = String(totalSec % 60).padStart(2, '0');
  return `${min}:${sec}`;
}

function startTimer() {
  _timerStartTime = Date.now();
  _totalTimerStartTime = Date.now();

  const dashboard = document.getElementById('gemini-dashboard');
  const currentDisplay = document.getElementById('gemini-dash-current');
  const totalDisplay = document.getElementById('gemini-dash-total');

  if (dashboard) dashboard.style.display = '';

  if (_timerInterval) clearInterval(_timerInterval);
  _timerInterval = setInterval(() => {
    if (_timerStartTime && currentDisplay) {
      currentDisplay.textContent = _formatTime(Date.now() - _timerStartTime);
    }
    if (_totalTimerStartTime && totalDisplay) {
      totalDisplay.textContent = _formatTime(Date.now() - _totalTimerStartTime);
    }
  }, 1000);
}

function stopTimer() {
  if (_timerInterval) {
    clearInterval(_timerInterval);
    _timerInterval = null;
  }
}

function resetTimerDisplay() {
  const currentDisplay = document.getElementById('gemini-dash-current');
  const totalDisplay = document.getElementById('gemini-dash-total');
  const progressDisplay = document.getElementById('gemini-dash-progress');
  const avgDisplay = document.getElementById('gemini-dash-average');
  if (currentDisplay) currentDisplay.textContent = '00:00';
  if (totalDisplay) totalDisplay.textContent = '00:00';
  if (progressDisplay) progressDisplay.textContent = '0 / 0';
  if (avgDisplay) avgDisplay.textContent = '00:00';
  _timerStartTime = null;
  _totalTimerStartTime = null;
}

// 更新看板进度
window._updateDashboardProgress = function(current, total) {
  const el = document.getElementById('gemini-dash-progress');
  if (el) el.textContent = `${current} / ${total}`;
};

// 更新看板среднее时间
window._updateDashboardAverage = function(timeStr) {
  const el = document.getElementById('gemini-dash-average');
  if (el) el.textContent = timeStr;
};


// ========== 日志功能 ==========
window._geminiAddLog = function(message, type = 'info') {
  const panel = document.getElementById('gemini-log-panel');
  if (!panel) return;

  const now = new Date();
  const timeStr = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map(n => String(n).padStart(2, '0')).join(':');

  const entry = document.createElement('div');
  entry.className = 'gemini-log-entry';

  const typeClass = {
    'success': 'gemini-log-success',
    'error':   'gemini-log-error',
    'warn':    'gemini-log-warn',
    'info':    'gemini-log-info',
  }[type] || 'gemini-log-info';

  entry.innerHTML = `<span class="gemini-log-time">[${timeStr}]</span> <span class="${typeClass}">${message}</span>`;
  panel.appendChild(entry);
  panel.scrollTop = panel.scrollHeight;
};

// ========== 队列生命周期回调 ==========
window._geminiOnQueueStart = function() {
  startTimer();
};

window._geminiOnPromptStart = function() {
  // 每个 prompt 重置计时器
  _timerStartTime = Date.now();
};

window._geminiOnQueueEnd = function() {
  stopTimer();
  const textarea = document.getElementById('gemini-prompt-input');
  const progressBar = document.getElementById('gemini-progress-fill');
  const progressText = document.getElementById('gemini-progress-text');

  // 文本 Tab: 恢复三态容器到 idle
  const textStartRow = document.getElementById('gemini-text-start-row');
  const textPauseBtn = document.getElementById('gemini-text-pause-btn');
  const textPauseActions = document.getElementById('gemini-text-pause-actions');
  const btn = document.getElementById('gemini-auto-runner-btn');
  const experimentBtn = document.getElementById('gemini-experiment-btn');
  const imageBtn = document.getElementById('gemini-image-runner-btn');
  const imagePauseActions = document.getElementById('gemini-image-pause-actions');

  if (textPauseBtn) { textPauseBtn.style.display = 'none'; textPauseBtn.disabled = false; }
  if (textPauseActions) textPauseActions.style.display = 'none';
  if (imagePauseActions) imagePauseActions.style.display = 'none';

  const resetToIdle = () => {
    if (progressBar) progressBar.style.width = '0%';
    if (progressText) progressText.innerText = 'готово: 0 / 0';
    if (textStartRow) textStartRow.style.display = '';
    if (btn) { btn.innerText = '▶ Запустить очередь'; btn.className = ''; btn.style.background = ''; btn.disabled = false; }
    if (experimentBtn) { experimentBtn.innerText = '🧪 Малый тест'; experimentBtn.className = 'gemini-experiment-btn'; experimentBtn.disabled = false; }
  };

  if (!window._geminiQueueAbort) {
    // 完成 → 短暂显示完成状态后恢复
    if (textStartRow) textStartRow.style.display = '';
    if (btn) { btn.innerText = '✅ Готово'; btn.className = 'completed'; }
    setTimeout(resetToIdle, 3000);
  } else {
    resetToIdle();
  }

  // 重置图片队列按钮
  if (imageBtn) {
    imageBtn.style.display = '';
    if (!window._geminiQueueAbort) {
      imageBtn.innerText = '✅ Очередь готова';
      imageBtn.className = 'completed';
      setTimeout(() => {
        imageBtn.innerText = '▶ Запустить очередь преобразования';
        imageBtn.className = '';
        imageBtn.style.background = '';
      }, 3000);
    } else {
      imageBtn.innerText = '▶ Запустить очередь преобразования';
      imageBtn.className = '';
      imageBtn.style.background = '';
    }
    imageBtn.disabled = false;
  }

  if (textarea) textarea.disabled = false;
};

// ========== Сквозная нумерация слайдов ==========
function _getSlideCounter() {
  const raw = parseInt(localStorage.getItem('gpt_slide_counter') || '1', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

function _setSlideCounter(value) {
  const n = Math.max(1, parseInt(value || '1', 10) || 1);
  localStorage.setItem('gpt_slide_counter', String(n));
  const input = document.getElementById('gemini-slide-counter-input');
  if (input) input.value = String(n);
  return n;
}

function _formatSlideNumber(n) {
  return String(n).padStart(3, '0');
}

function _makeZipItemsFromCollected(collected) {
  const seen = new Set();
  const perTaskCount = new Map();
  const items = [];
  for (const item of collected) {
    const src = item && item.src;
    if (!src || seen.has(src)) continue;
    seen.add(src);
    const taskIndex = Number.isFinite(Number(item.taskIndex)) && Number(item.taskIndex) > 0 ? Number(item.taskIndex) : (items.length + 1);
    const n = (perTaskCount.get(taskIndex) || 0) + 1;
    perTaskCount.set(taskIndex, n);
    items.push({ src, taskIndex, duplicateIndex: n });
  }
  return items.sort((a, b) => (a.taskIndex - b.taskIndex) || (a.duplicateIndex - b.duplicateIndex));
}

// ========== 注入侧边栏 ==========
function injectControlUI() {
  if (document.getElementById('gemini-auto-sidebar')) return;

  // 创建侧边栏容器
  const sidebar = document.createElement('div');
  sidebar.id = 'gemini-auto-sidebar';
  sidebar.innerHTML = SIDEBAR_HTML;
  document.body.appendChild(sidebar);

  // 恢复文本设置和下载目录设置
  const downloadFolderInput = document.getElementById('gemini-download-folder');
  if (downloadFolderInput) {
    const savedFolder = localStorage.getItem('gemini-download-folder');
    if (savedFolder) downloadFolderInput.value = savedFolder;
    downloadFolderInput.addEventListener('input', (e) => {
      localStorage.setItem('gemini-download-folder', e.target.value);
    });
  }

  // 原图提取下载
  const downloadBtn = document.getElementById('gemini-download-btn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', async () => {
      if (downloadBtn.disabled) return;
      
      let fileHandle;
      try {
        if (window.showSaveFilePicker) {
          fileHandle = await window.showSaveFilePicker({
            suggestedName: `chatgpt_images_${Date.now()}.zip`,
            types: [{ description: 'ZIP Archive', accept: { 'application/zip': ['.zip'] } }]
          });
        }
      } catch (e) {
        // 用户取消或拒绝
        if (e.name === 'AbortError') return;
        window._geminiAddLog('⚠️ Не удалось открыть диалог сохранения, использую обычное скачивание.', 'warn');
      }

      downloadBtn.disabled = true;

      const startTime = Date.now();
      const formatTime = (ms) => {
        const total = Math.floor(ms / 1000);
        const m = String(Math.floor(total / 60)).padStart(2, '0');
        const s = String(total % 60).padStart(2, '0');
        return `${m}:${s}`;
      };

      downloadBtn.innerText = `⏳ Упаковка... 00:00`;
      const timerStr = setInterval(() => {
        downloadBtn.innerText = `⏳ Упаковка... ${formatTime(Date.now() - startTime)}`;
      }, 1000);

      try {
        window._geminiAddLog('Извлекаю все оригинальные изображения со страницы...', 'info');
        // Берём накопленные после каждой генерации картинки. Это важнее, чем
        // сканировать DOM в конце: Gemini часто оставляет в DOM только последнюю картинку.
        if (window.collectGeneratedImagesForZip) {
          await window.collectGeneratedImagesForZip(0);
        }
        const collected = Array.isArray(window._geminiCollectedImages) ? window._geminiCollectedImages : [];
        let downloadItems = _makeZipItemsFromCollected(collected);

        // Fallback: если накопитель пуст, пробуем собрать видимые крупные картинки.
        if (downloadItems.length === 0) {
          let images = (typeof _getCandidateGeneratedImages === 'function')
            ? _getCandidateGeneratedImages()
            : Array.from(document.querySelectorAll(
                'generated-image img, img.image.loaded, img[src*="googleusercontent.com"], img[src^="blob:https://gemini.google.com"], img[src^="data:image"]'
              )).filter(img => {
                const src = img.currentSrc || img.src || '';
                const w = img.naturalWidth || img.width || 0;
                const h = img.naturalHeight || img.height || 0;
                if (!src) return false;
                if (src.includes('favicon') || src.includes('avatar') || src.includes('googlelogo') || src.includes('logo')) return false;
                if (src.includes('gstatic.com')) return false;
                if (w < 256 || h < 256) return false;
                return true;
              });
          const baseline = window._geminiQueueBaselineImageKeys instanceof Set ? window._geminiQueueBaselineImageKeys : new Set();
          images = images.filter(img => {
            if (baseline.size === 0 || typeof _getImageKeyFromSrc !== 'function') return true;
            const key = _getImageKeyFromSrc(img.currentSrc || img.src || '');
            return !baseline.has(key);
          });
          downloadItems = images.map((img, idx) => ({ src: img.currentSrc || img.src, taskIndex: idx + 1, duplicateIndex: 1 })).filter(x => x.src);
        }

        downloadItems = downloadItems.map(item => {
          const url = item.src;
          if (url.startsWith('blob:') || url.startsWith('data:image/')) return item;
          let fullUrl = url;
          const lastEqIndex = url.lastIndexOf('=');
          if (lastEqIndex !== -1) fullUrl = url.substring(0, lastEqIndex + 1) + 's0';
          else fullUrl = url + '=s0';
          return { ...item, src: fullUrl };
        });

        if (downloadItems.length > 0) {
          window._geminiAddLog(`✅ Найдено ${downloadItems.length} изображений, скачиваю и упаковываю по номерам промтов...`, 'info');

          if (typeof JSZip === 'undefined') {
             throw new Error("JSZip 库未加载，无法执行打包");
          }

          const zip = new JSZip();
          const startSlideNumber = _getSlideCounter();
          // 用根目录代替之前的自定义文件夹层级
          let completed = 0;
          const maxConcurrency = 5; // 控制并发
          for (let i = 0; i < downloadItems.length; i += maxConcurrency) {
            const chunk = downloadItems.slice(i, i + maxConcurrency);
            await Promise.all(chunk.map(async (item, idx) => {
              const url = item.src;
              const globalIdx = i + idx;
              try {
                let response;
                let ext = 'jpg';
                if (url.startsWith('data:image/')) {
                  const m = url.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.*)$/);
                  if (!m) throw new Error('Unsupported data image');
                  ext = m[1] === 'jpeg' ? 'jpg' : m[1];
                  response = m[2];
                } else if (url.startsWith('blob:')) {
                  const blob = await fetch(url).then(r => r.blob());
                  ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
                  const dataUrl = await new Promise((resolve, reject) => {
                    const fr = new FileReader();
                    fr.onload = () => resolve(fr.result);
                    fr.onerror = reject;
                    fr.readAsDataURL(blob);
                  });
                  response = String(dataUrl).split(',')[1];
                } else {
                  response = await new Promise((resolve, reject) => {
                    chrome.runtime.sendMessage({ action: 'FETCH_IMAGE_B64', url: url }, (res) => {
                      if (chrome.runtime.lastError) return reject(chrome.runtime.lastError.message);
                      if (res && res.success) resolve(res.data);
                      else reject(res ? res.error : 'Unknown fetch error');
                    });
                  });
                }
                const slideNumber = item.taskIndex || (startSlideNumber + globalIdx);
                const dup = item.duplicateIndex && item.duplicateIndex > 1 ? `_alt${String(item.duplicateIndex).padStart(2, '0')}` : '';
                zip.file(`prompt_${_formatSlideNumber(slideNumber)}${dup}.${ext}`, response, { base64: true });
              } catch (err) {
                console.error("Fetch image error", err);
              }
            }));
            completed += chunk.length;
            window._geminiAddLog(`🕒 Прогресс скачивания: ${completed}/${downloadItems.length}`, 'info');
          }
          
          window._geminiAddLog(`📦 Загрузка завершена, создаю ZIP...`, 'info');
          const content = await zip.generateAsync({ type: "blob" });
          
          if (fileHandle) {
             window._geminiAddLog(`💾 Записываю файл в выбранную папку...`, 'info');
             const writable = await fileHandle.createWritable();
             await writable.write(content);
             await writable.close();
          } else {
             const a = document.createElement("a");
             const objectUrl = URL.createObjectURL(content);
             a.href = objectUrl;
             a.download = `chatgpt_images_${Date.now()}.zip`;
             a.click();
             setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
          }

          _setSlideCounter(Math.max(_getSlideCounter(), startSlideNumber + downloadItems.length));
          window._geminiAddLog(`🚀 Скачивание завершено! Файлы названы по промтам: prompt_001, prompt_002... Если промт был повторён, будет _alt02. (общее время ${formatTime(Date.now() - startTime)})`, 'success');
        } else {
          window._geminiAddLog('❌ 未Найдено可下载的 AI Сгенерируй изображение。', 'warn');
        }
      } catch(e) {
         window._geminiAddLog('❌ Ошибка упаковки: ' + e, 'error');
      } finally {
        clearInterval(timerStr);
        downloadBtn.disabled = false;
        downloadBtn.innerText = '📥 Скачать картинки этой страницы ZIP';
      }
    });
  }

  // ===== 启动文本批量Задача =====
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'gemini-resize-handle';
  sidebar.appendChild(resizeHandle);

  // 恢复上次保存的宽度
  const savedWidth = localStorage.getItem('gemini-sidebar-width');
  if (savedWidth) {
    sidebar.style.setProperty('--sidebar-width', savedWidth);
    document.documentElement.style.setProperty('--sidebar-width', savedWidth);
  }

  let isResizing = false;
  resizeHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isResizing = true;
    resizeHandle.classList.add('active');
    sidebar.style.transition = 'none'; // 拖拽时禁用过渡动画
    document.documentElement.style.transition = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const newWidth = Math.min(600, Math.max(260, window.innerWidth - e.clientX));
    const widthPx = newWidth + 'px';
    sidebar.style.setProperty('--sidebar-width', widthPx);
    document.documentElement.style.setProperty('--sidebar-width', widthPx);
  });

  document.addEventListener('mouseup', () => {
    if (!isResizing) return;
    isResizing = false;
    resizeHandle.classList.remove('active');
    sidebar.style.transition = '';
    document.documentElement.style.transition = '';
    // 保存宽度
    const currentWidth = getComputedStyle(sidebar).getPropertyValue('--sidebar-width').trim();
    localStorage.setItem('gemini-sidebar-width', currentWidth);
  });

  // 创建展开按钮
  const openBtn = document.createElement('button');
  openBtn.id = 'gemini-open-btn';
  openBtn.innerText = '◀ Развернуть';
  document.body.appendChild(openBtn);
  
  // === 初始化侧边栏状态 ===
  let defaultOpen = false;
  if (window.location.search.includes('gemini_sidebar_open=1')) {
    defaultOpen = true;
    // 重写 URL，去掉参数避免刷新时错误
    const newUrl = window.location.href.replace('gemini_sidebar_open=1', '').replace(/[\?&]$/, '').replace('?&', '?');
    window.history.replaceState({}, document.title, newUrl);
  }

  if (defaultOpen) {
    sidebar.style.transform = 'translateX(0)';
    document.documentElement.classList.add('gemini-sidebar-open');
    openBtn.style.display = 'none';
  } else {
    sidebar.style.transform = 'translateX(100%)';
    document.documentElement.classList.remove('gemini-sidebar-open');
    openBtn.style.display = 'block';
  }

  // ===== 绑定事件 =====

  // 收起/展开
  const collapseBtn = document.getElementById('gemini-collapse-btn');
  collapseBtn.onclick = () => {
    sidebar.style.transform = 'translateX(100%)';
    document.documentElement.classList.remove('gemini-sidebar-open');
    setTimeout(() => { openBtn.style.display = 'block'; }, 300);
  };
  openBtn.onclick = () => {
    openBtn.style.display = 'none';
    sidebar.style.transform = 'translateX(0)';
    document.documentElement.classList.add('gemini-sidebar-open');
  };

  // ===== Tab 切换 =====
  const tabs = sidebar.querySelectorAll('.gemini-tab');
  const tabContents = sidebar.querySelectorAll('.gemini-tab-content');
  tabs.forEach(tab => {
    tab.onclick = () => {
      if (window._geminiIsRunning) return; // 运行中不允许切换
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const target = sidebar.querySelector(`#gemini-tab-${tab.dataset.tab}`);
      if (target) target.classList.add('active');
    };
  });

  // ===== 文本生图 启动/暂停/继续/终止按钮 =====
  const btn = document.getElementById('gemini-auto-runner-btn');
  const textarea = document.getElementById('gemini-prompt-input');
  const prefixInput = document.getElementById('gemini-prefix-input');
  const suffixInput = document.getElementById('gemini-suffix-input');
  const experimentBtn = document.getElementById('gemini-experiment-btn');
  const textStartRow = document.getElementById('gemini-text-start-row');
  const textPauseBtn = document.getElementById('gemini-text-pause-btn');
  const textPauseActions = document.getElementById('gemini-text-pause-actions');
  const textResumeBtn = document.getElementById('gemini-text-resume-btn');
  const textTerminateBtn = document.getElementById('gemini-text-terminate-btn');

  // ===== 状态持久化 (localStorage) =====
  if (localStorage.getItem('gemini_saved_prefix')) {
    prefixInput.value = localStorage.getItem('gemini_saved_prefix');
  }
  if (localStorage.getItem('gemini_saved_prompt')) {
    textarea.value = localStorage.getItem('gemini_saved_prompt');
  }
  if (localStorage.getItem('gemini_saved_suffix')) {
    suffixInput.value = localStorage.getItem('gemini_saved_suffix');
  }
  if (localStorage.getItem('gemini_saved_newchat_interval')) {
    const newChatInput = document.getElementById('gemini-newchat-interval');
    if (newChatInput) newChatInput.value = localStorage.getItem('gemini_saved_newchat_interval');
  }
  if (localStorage.getItem('gemini_saved_task_interval')) {
    const taskIntervalInput = document.getElementById('gemini-task-interval');
    if (taskIntervalInput) taskIntervalInput.value = localStorage.getItem('gemini_saved_task_interval');
  }
  if (localStorage.getItem('gemini_saved_task_jitter')) {
    const taskJitterInput = document.getElementById('gemini-task-jitter');
    if (taskJitterInput) taskJitterInput.value = localStorage.getItem('gemini_saved_task_jitter');
  }

  if (localStorage.getItem('gemini_saved_wait_timeout_sec')) {
    const waitTimeoutInput = document.getElementById('gemini-wait-timeout-sec');
    if (waitTimeoutInput) waitTimeoutInput.value = localStorage.getItem('gemini_saved_wait_timeout_sec');
  }
  if (localStorage.getItem('gemini_saved_settle_sec')) {
    const settleInput = document.getElementById('gemini-settle-sec');
    if (settleInput) settleInput.value = localStorage.getItem('gemini_saved_settle_sec');
  }
  if (localStorage.getItem('gemini_saved_retry_attempts')) {
    const retryInput = document.getElementById('gemini-retry-attempts');
    if (retryInput) retryInput.value = localStorage.getItem('gemini_saved_retry_attempts');
  }

  const slideCounterInput = document.getElementById('gemini-slide-counter-input');
  const resetSlideCounterBtn = document.getElementById('gemini-reset-slide-counter-btn');
  if (slideCounterInput) {
    slideCounterInput.value = String(_getSlideCounter());
    slideCounterInput.addEventListener('input', () => _setSlideCounter(slideCounterInput.value));
  }
  if (resetSlideCounterBtn) {
    resetSlideCounterBtn.addEventListener('click', () => {
      _setSlideCounter(1);
      window._geminiAddLog('↺ Нумерация слайдов сброшена: следующий файл будет slide_001', 'success');
    });
  }

  // 监听输入并自动保存
  prefixInput.addEventListener('input', () => {
    localStorage.setItem('gemini_saved_prefix', prefixInput.value);
  });
  const updatePromptCount = () => {
    const text = textarea.value || '';
    const count = text.split('\n').map(l => l.trim()).filter(l => l).length;
    const badge = document.getElementById('gemini-prompt-count');
    if (badge) badge.innerText = count;
  };

  textarea.addEventListener('input', () => {
    localStorage.setItem('gemini_saved_prompt', textarea.value);
    updatePromptCount();
  });
  
  // 初始计数
  updatePromptCount();
  suffixInput.addEventListener('input', () => {
    localStorage.setItem('gemini_saved_suffix', suffixInput.value);
  });
  
  const newChatInput = document.getElementById('gemini-newchat-interval');
  if (newChatInput) {
    newChatInput.addEventListener('input', () => {
      localStorage.setItem('gemini_saved_newchat_interval', newChatInput.value);
    });
  }

  const taskIntervalInput = document.getElementById('gemini-task-interval');
  if (taskIntervalInput) {
    taskIntervalInput.addEventListener('input', () => {
      localStorage.setItem('gemini_saved_task_interval', taskIntervalInput.value);
    });
  }

  const taskJitterInput = document.getElementById('gemini-task-jitter');
  if (taskJitterInput) {
    taskJitterInput.addEventListener('input', () => {
      localStorage.setItem('gemini_saved_task_jitter', taskJitterInput.value);
    });
  }

  const waitTimeoutInput = document.getElementById('gemini-wait-timeout-sec');
  if (waitTimeoutInput) {
    waitTimeoutInput.addEventListener('input', () => {
      localStorage.setItem('gemini_saved_wait_timeout_sec', waitTimeoutInput.value);
    });
  }
  const settleInput = document.getElementById('gemini-settle-sec');
  if (settleInput) {
    settleInput.addEventListener('input', () => {
      localStorage.setItem('gemini_saved_settle_sec', settleInput.value);
    });
  }
  const retryInput = document.getElementById('gemini-retry-attempts');
  if (retryInput) {
    retryInput.addEventListener('input', () => {
      localStorage.setItem('gemini_saved_retry_attempts', retryInput.value);
    });
  }

  // 跟踪当前运行模式
  let _textRunMode = null;

  // 三种互斥状态：idle / running / paused
  function showTextState(state) {
    textStartRow.style.display   = state === 'idle'    ? '' : 'none';
    textPauseBtn.style.display   = state === 'running' ? '' : 'none';
    textPauseActions.style.display = state === 'paused'  ? 'flex' : 'none';
  }

  // 启动作图队列
  btn.onclick = async () => {
    _textRunMode = 'queue';
    textPauseBtn.innerText = '⏸ Пауза';
    textPauseBtn.disabled = false;
    showTextState('running');
    textarea.disabled = true;
    resetTimerDisplay();
    await runGeminiQueue();
  };

  // 实验模式
  experimentBtn.onclick = async () => {
    _textRunMode = 'experiment';
    textPauseBtn.innerText = '⏸ 暂停实验';
    textPauseBtn.disabled = false;
    showTextState('running');
    textarea.disabled = true;
    resetTimerDisplay();
    await runExperimentQueue();
  };

  // 暂停按钮（运行中点击）
  textPauseBtn.onclick = () => {
    window._geminiQueuePaused = true;
    window._geminiAddLog('⏸ Пауза, жду действия пользователя...', 'warn');
    showTextState('paused');
  };

  // 继续
  textResumeBtn.onclick = () => {
    window._geminiQueuePaused = false;
    window._geminiAddLog('▶ Продолжено', 'success');
    textPauseBtn.innerText = _textRunMode === 'experiment' ? '⏸ 暂停实验' : '⏸ Пауза';
    showTextState('running');
  };

  // 终止
  textTerminateBtn.onclick = () => {
    window._geminiQueuePaused = false;
    window._geminiQueueAbort = true;
    window._geminiAddLog('🛑 Остановлено', 'warn');
    textPauseBtn.innerText = '⏳ 正在停止...';
    textPauseBtn.disabled = true;
    showTextState('running');
  };

  // ===== 图片转换：文件选择与拖拽 =====
  window._imageQueueFiles = [];
  const fileInput = document.getElementById('gemini-image-file-input');
  const selectBtn = document.getElementById('gemini-image-select-btn');
  const imageCount = document.getElementById('gemini-image-count');
  const imagePreview = document.getElementById('gemini-image-preview');
  const uploadArea = document.getElementById('gemini-image-upload-area');

  selectBtn.onclick = () => fileInput.click();

  function renderImagePreview() {
    imageCount.textContent = window._imageQueueFiles.length > 0 ? `Выбрано ${window._imageQueueFiles.length}  изображений` : 'Файлы не выбраны';
    imagePreview.innerHTML = '';
    window._imageQueueFiles.forEach((file, idx) => {
      const item = document.createElement('div');
      item.className = 'gemini-image-preview-item';

      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.title = file.name;

      const name = document.createElement('span');
      name.className = 'gemini-image-name';
      name.textContent = file.name.length > 12 ? file.name.substring(0, 10) + '...' : file.name;

      const delBtn = document.createElement('button');
      delBtn.className = 'gemini-image-del-btn';
      delBtn.textContent = '×';
      delBtn.title = '移除';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        window._imageQueueFiles.splice(idx, 1);
        renderImagePreview();
        
        const dt = new DataTransfer();
        window._imageQueueFiles.forEach(f => dt.items.add(f));
        fileInput.files = dt.files;
      };

      item.appendChild(img);
      item.appendChild(name);
      item.appendChild(delBtn);
      imagePreview.appendChild(item);
    });
  }

  fileInput.onchange = () => {
    const files = Array.from(fileInput.files);
    window._imageQueueFiles = window._imageQueueFiles.concat(files);
    renderImagePreview();
  };

  function scanFiles(entry) {
    return new Promise((resolve) => {
      if (!entry) {
        resolve([]);
        return;
      }
      if (entry.isFile) {
        entry.file(f => resolve([f]));
      } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        let results = [];
        function readEntries() {
          dirReader.readEntries((res) => {
            if (!res.length) {
              Promise.all(results.map(e => scanFiles(e))).then(filesArrays => {
                resolve(filesArrays.flat());
              });
            } else {
              results = results.concat(Array.from(res));
              readEntries();
            }
          }, () => resolve([]));
        }
        readEntries();
      } else {
         resolve([]);
      }
    });
  }

  if (uploadArea) {
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', async (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      
      if (!e.dataTransfer || !e.dataTransfer.items) return;
      
      const originalText = imageCount.textContent;
      imageCount.textContent = 'Читаю файлы...';
      
      let entries = [];
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        let entry = e.dataTransfer.items[i].webkitGetAsEntry();
        if (entry) entries.push(entry);
      }
      
      let allFiles = [];
      for (let entry of entries) {
        const files = await scanFiles(entry);
        allFiles = allFiles.concat(files);
      }
      
      const imageFiles = allFiles.filter(f => f.type.startsWith('image/') || f.name.match(/\.(png|jpe?g|gif|webp|svg|bmp)$/i));
      
      if (imageFiles.length > 0) {
        window._imageQueueFiles = window._imageQueueFiles.concat(imageFiles);
        renderImagePreview();
        
        const dt = new DataTransfer();
        window._imageQueueFiles.forEach(f => dt.items.add(f));
        fileInput.files = dt.files;
      } else {
        imageCount.textContent = originalText;
      }
    });
  }

  // ===== 图片转换 启动/暂停/继续/终止按钮 =====
  const imageRunBtn = document.getElementById('gemini-image-runner-btn');
  const imagePauseActions = document.getElementById('gemini-image-pause-actions');
  const imageResumeBtn = document.getElementById('gemini-image-resume-btn');
  const imageTerminateBtn = document.getElementById('gemini-image-terminate-btn');

  function showImagePauseUI() {
    imageRunBtn.style.display = 'none';
    imagePauseActions.style.display = 'flex';
  }

  function hideImagePauseUI() {
    imagePauseActions.style.display = 'none';
    imageRunBtn.style.display = '';
  }

  imageRunBtn.onclick = async () => {
    if (window._geminiIsRunning) {
      // 暂停
      window._geminiQueuePaused = true;
      window._geminiAddLog('⏸ 队列Пауза, жду действия пользователя...', 'warn');
      showImagePauseUI();
    } else {
      imageRunBtn.innerText = '⏸ Пауза';
      imageRunBtn.className = 'running';
      resetTimerDisplay();
      await runImageQueue();
    }
  };

  imageResumeBtn.onclick = () => {
    window._geminiQueuePaused = false;
    window._geminiAddLog('▶ 队列Продолжено', 'success');
    hideImagePauseUI();
    imageRunBtn.innerText = '⏸ Пауза';
    imageRunBtn.className = 'running';
    imageRunBtn.style.display = '';
  };

  imageTerminateBtn.onclick = () => {
    window._geminiQueuePaused = false;
    window._geminiQueueAbort = true;
    window._geminiAddLog('🛑 队列Остановлено', 'warn');
    hideImagePauseUI();
    imageRunBtn.innerText = '⏳ 正在停止...';
    imageRunBtn.disabled = true;
    imageRunBtn.style.display = '';
  };

  // ===== 风格多选下拉框 =====
  const styleSelectBtn = document.getElementById('gemini-style-select-btn');
  const styleDropdown = document.getElementById('gemini-style-dropdown');
  const styleSearch = document.getElementById('gemini-style-search');
  const styleOptions = document.getElementById('gemini-style-options');
  const styleCount = document.getElementById('gemini-style-count');
  const selectedStyles = new Set();

  function renderStyleOptions(filter = '') {
    if (typeof prompts === 'undefined' || !Array.isArray(prompts)) return;
    styleOptions.innerHTML = '';
    const filterLower = filter.toLowerCase();
    prompts.forEach((p, idx) => {
      const cn = STYLE_CN_MAP[p.style] || '';
      const label = cn ? `${p.style} (${cn})` : p.style;
      if (filter && !label.toLowerCase().includes(filterLower) && !p.group.toLowerCase().includes(filterLower)) return;
      const item = document.createElement('label');
      item.className = 'gemini-style-option' + (selectedStyles.has(idx) ? ' selected' : '');
      item.innerHTML = `<input type="checkbox" value="${idx}" ${selectedStyles.has(idx) ? 'checked' : ''} /><span>${label}</span>`;
      item.querySelector('input').onchange = (e) => {
        if (e.target.checked) {
          selectedStyles.add(idx);
          item.classList.add('selected');
        } else {
          selectedStyles.delete(idx);
          item.classList.remove('selected');
        }
        updateStyleCount();
      };
      styleOptions.appendChild(item);
    });
  }

  function updateStyleCount() {
    styleCount.textContent = selectedStyles.size > 0 ? `(${selectedStyles.size})` : '';
  }

  styleSelectBtn.onclick = (e) => {
    e.stopPropagation();
    const isVisible = styleDropdown.style.display !== 'none';
    styleDropdown.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) {
      renderStyleOptions(styleSearch.value);
      styleSearch.focus();
    }
  };

  styleSearch.oninput = () => {
    renderStyleOptions(styleSearch.value);
  };

  styleSearch.onclick = (e) => e.stopPropagation();
  styleOptions.onclick = (e) => e.stopPropagation();
  styleDropdown.onclick = (e) => e.stopPropagation();

  // 点击外部关闭下拉框
  document.addEventListener('click', () => {
    styleDropdown.style.display = 'none';
  });

  // 打乱按钮
  const shuffleBtn = document.getElementById('gemini-shuffle-prompts-btn');
  if (shuffleBtn) {
    shuffleBtn.onclick = () => {
      const lines = textarea.value.split('\n').map(l => l.trim()).filter(l => l);
      if (lines.length === 0) return;
      for (let i = lines.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [lines[i], lines[j]] = [lines[j], lines[i]];
      }
      textarea.value = lines.join('\n');
      updatePromptCount();
      localStorage.setItem('gemini_saved_prompt', textarea.value);
      window._geminiAddLog(`🔀 Перемешано ${lines.length} 条提示词`, 'info');
    };
  }

  // 全都要按钮
  const allPromptsBtn = document.getElementById('gemini-all-prompts-btn');
  if (allPromptsBtn) {
    allPromptsBtn.onclick = () => {
      if (typeof prompts === 'undefined' || !Array.isArray(prompts) || prompts.length === 0) {
        window._geminiAddLog('❌ 未Найдено预设风格数据', 'error');
        return;
      }
      textarea.value = prompts.map(p => p.prompt).join('\n');
      updatePromptCount();
      localStorage.setItem('gemini_saved_prompt', textarea.value);
      window._geminiAddLog(`🌌 Загружены все ${prompts.length} 条预设提示词`, 'info');
    };
  }

  // 随机风格按钮
  const randomBtn = document.getElementById('gemini-random-style-btn');
  if (randomBtn) {
    randomBtn.onclick = () => {
      if (typeof prompts === 'undefined' || !Array.isArray(prompts) || prompts.length === 0) {
        window._geminiAddLog('❌ 未Найдено预设风格数据', 'error');
        return;
      }
      let pool = selectedStyles.size > 0 ? [...selectedStyles].map(idx => prompts[idx]) : [...prompts];
      const count = Math.min(5, pool.length);
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      const picked = shuffled.slice(0, count);
      textarea.value = picked.map(p => p.prompt).join('\n');
      updatePromptCount();
      localStorage.setItem('gemini_saved_prompt', textarea.value);
      window._geminiAddLog(`🎲 已случайно выбрано ${picked.length} 个风格`, 'info');
    };
  }

  // 初始日志
  const _currentSite = getSiteConfig();
  window._geminiAddLog(`Панель загружена [${_currentSite.name}]，готово`, 'info');
}

// ========== 延迟注入 ==========
setTimeout(injectControlUI, 3000);

// ========== 监听插件图标点击 ==========
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'toggleSidebar') {
    const sidebar = document.getElementById('gemini-auto-sidebar');
    const openBtn = document.getElementById('gemini-open-btn');
    if (!sidebar) return;
    const isHidden = sidebar.style.transform === 'translateX(100%)';
    if (isHidden) {
      sidebar.style.transform = 'translateX(0)';
      document.documentElement.classList.add('gemini-sidebar-open');
      if (openBtn) openBtn.style.display = 'none';
    } else {
      sidebar.style.transform = 'translateX(100%)';
      document.documentElement.classList.remove('gemini-sidebar-open');
      setTimeout(() => { if (openBtn) openBtn.style.display = 'block'; }, 300);
    }
  }
});
