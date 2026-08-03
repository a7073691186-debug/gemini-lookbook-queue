/**
 * automation.js — 核心自动化逻辑
 * 负责：发送提示词、监听图片生成、队列执行
 * 支持：Gemini、ChatGPT、Grok
 */

// ========== 全局状态 ==========
window._geminiQueueAbort = false;
window._geminiIsRunning = false;
window._geminiQueuePaused = false;

// ========== Wake Lock（防止休眠） ==========
let _wakeLock = null;

async function acquireWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      _wakeLock = await navigator.wakeLock.request('screen');
      window._geminiAddLog('🔒 включеноэкран без сна（防止休眠）', 'info');
      _wakeLock.addEventListener('release', () => {
        window._geminiAddLog('🔓 экран без снавыключено', 'info');
      });
    } else {
      window._geminiAddLog('⚠️ Браузер не поддерживает Wake Lock, сон экрана не заблокирован', 'warn');
    }
  } catch (err) {
    window._geminiAddLog(`⚠️ Не удалось включить Wake Lock: ${err.message}`, 'warn');
  }
}

async function releaseWakeLock() {
  if (_wakeLock) {
    try {
      await _wakeLock.release();
    } catch (e) {}
    _wakeLock = null;
  }
}

// 页面重新可见时自动重新获取 Wake Lock
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && window._geminiIsRunning && !_wakeLock) {
    await acquireWakeLock();
  }
});

// 日志回调（由 sidebar.js 注入）
window._geminiAddLog = window._geminiAddLog || function(msg, type) {
  console.log(`[LOG][${type || 'info'}] ${msg}`);
};

// ========== 多站点配置 ==========
const SITE_CONFIGS = {
  gemini: {
    name: 'Gemini',
    urlPattern: /gemini\.google\.com/,
    inputSelector: 'div[contenteditable="true"], textarea',
    sendButtonSelector: 'button[aria-label*="发送"], button[aria-label*="Send"], .send-button-class',
    failKeywords: ['无法生成', '请重试', '安全限制'],
    fileInputSelector: 'input[type="file"]',
    uploadButtonSelector: 'button[aria-label*="上传"], button[aria-label*="Upload"], button[aria-label*="image"], button[aria-label*="图片"]',
    newChatButtonSelector: 'a[aria-label*="New chat"], a[aria-label*="新建聊天"], a[aria-label*="新聊天"], a[aria-label*="新对话"], button[aria-label*="New chat"], button[aria-label*="新建聊天"], button[aria-label*="新聊天"], button[aria-label*="新对话"], [data-test-id*="new-chat"]',
  },
  chatgpt: {
    name: 'ChatGPT',
    urlPattern: /chat(gpt)?\.openai\.com|chatgpt\.com/,
    inputSelector: '#prompt-textarea, div.ProseMirror[contenteditable="true"], div[contenteditable="true"]',
    sendButtonSelector: 'button[data-testid="send-button"], button[aria-label*="Send"], button[aria-label*="Отправ"], button[aria-label*="发送"], form button[type="submit"]',
    failKeywords: ['unable to generate', 'content policy', 'не удалось создать', 'политик'],
    fileInputSelector: 'input[type="file"]',
    uploadButtonSelector: 'button[aria-label*="Attach"], button[aria-label*="附件"], button[aria-label*="Upload"]',
    newChatButtonSelector: 'a[data-testid*="new-chat"], a[href="/"], button[aria-label*="New chat"], button[aria-label*="新聊天"]',
  },
  grok: {
    name: 'Grok',
    urlPattern: /grok\.com/,
    inputSelector: 'textarea, div[contenteditable="true"]',
    sendButtonSelector: 'button[aria-label*="Send"], button[aria-label*="submit"], button[type="submit"]',
    failKeywords: ['unable to generate', 'content policy', '无法生成'],
    fileInputSelector: 'input[type="file"]',
    uploadButtonSelector: 'button[aria-label*="Attach"], button[aria-label*="Upload"]',
    newChatButtonSelector: 'a[href="/chat"], a[aria-label*="聊天"], a[aria-label*="Chat"], button[aria-label*="New chat"], button[aria-label*="New conversation"]',
  },
};

// 通用配置
const QUEUE_CONFIG = {
  minDelay: 5000,
  maxDelay: 15000,
  timeoutMs: 120000,
  settleAfterSuccessMs: 10000,
  retryAttempts: 2,
};

function getSiteConfig() {
  const url = window.location.href;
  for (const [key, config] of Object.entries(SITE_CONFIGS)) {
    if (config.urlPattern.test(url)) {
      return config;
    }
  }
  // 默认回退到 Gemini 配置
  return SITE_CONFIGS.gemini;
}

// ========== 工具函数 ==========
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 暂停等待：循环检查 _geminiQueuePaused，直到取消暂停或终止
async function waitWhilePaused() {
  while (window._geminiQueuePaused && !window._geminiQueueAbort) {
    await sleep(500);
  }
}

function simulateInput(element, text) {
  element.focus();

  if (element.isContentEditable) {
    // 清空并插入文本（兼容 ProseMirror 等富文本编辑器）
    element.innerHTML = '';
    const p = document.createElement('p');
    p.textContent = text;
    element.appendChild(p);
  } else {
    // 原生 textarea
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(element, text);
    } else {
      element.value = text;
    }
  }
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

// ========== 执行输入 ==========
async function executeInput(promptText, delaySec = 0, currentTaskIndex = 1, totalTasks = 1) {
  const site = getSiteConfig();
  window._geminiAddLog(`[${site.name}] Ищу поле ввода...`, 'info');

  let inputBox = document.querySelector(site.inputSelector);

  if (!inputBox) {
    // 重试一次，等待动态渲染
    await sleep(1000);
    inputBox = document.querySelector(site.inputSelector);
  }

  if (!inputBox) {
    window._geminiAddLog('❌ Поле ввода не найдено！', 'error');
    return false;
  }

  window._geminiAddLog(`Вставляю промт: "${promptText.substring(0, 40)}${promptText.length > 40 ? '...' : ''}"`, 'info');
  simulateInput(inputBox, promptText);
  await sleep(800);

  // === 第二段冷却 (等待发送) ===
  if (delaySec > 0 && !window._geminiQueueAbort) {
    window._geminiAddLog(`⏸ 第二段冷却 (等待发送) ${delaySec}秒...`, 'info');
    const btn = document.getElementById('gemini-auto-runner-btn');
    for (let sec = delaySec; sec > 0 && !window._geminiQueueAbort; sec--) {
      await waitWhilePaused();
      if (window._geminiQueueAbort) break;
      const progress = ((delaySec - sec) / delaySec) * 100;
      if (window._updateDashboardProgress) window._updateDashboardProgress(currentTaskIndex, totalTasks);
      if (btn) {
        btn.innerText = `⏸ 发送倒数 ${sec}s`;
        btn.style.background = `linear-gradient(90deg, rgba(255,255,255,0.15) ${progress}%, transparent ${progress}%), linear-gradient(135deg, #e53935, #c62828)`;
      }
      await sleep(1000);
    }
    if (btn && !window._geminiQueueAbort) {
      btn.innerText = '⏸ Пауза';
      btn.style.background = '';
    }
  }

  if (window._geminiQueueAbort) return false;

  let sendBtn = document.querySelector(site.sendButtonSelector);
  if (sendBtn) {
    window._geminiAddLog('Нажимаю отправку', 'info');
    sendBtn.click();
  } else {
    window._geminiAddLog('Кнопка отправки не найдена, пробую Enter', 'warn');
    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
    });
    inputBox.dispatchEvent(enterEvent);
  }
  return true;
}

// ========== 监听生成结果 ==========

// 获取页面上回复前的图片快照（用于对比新增）
function _getExistingImageSrcs() {
  const imgs = document.querySelectorAll('img');
  return new Set(Array.from(imgs).map(img => img.src).filter(Boolean));
}

// --- Gemini / Grok: 组合 MutationObserver 和 轮询方式 ---
function startObserverDefault(site, maxWaitMs = QUEUE_CONFIG.timeoutMs) {
  // 快照当前所有图片 src，避免把上传预览误判为生成结果
  const existingImgSrcs = _getExistingImageSrcs();

  return new Promise((resolve) => {
    const observerTimeoutMs = Math.max(0, maxWaitMs);
    window._geminiAddLog(`Жду результат генерации (超时: ${Math.ceil(observerTimeoutMs / 1000)}s)...`, 'info');

    let isGenerating = true;
    let observer;
    let pollInterval;
    let checkTimeout;

    const cleanupAndResolve = (result) => {
      if (!isGenerating) return;
      isGenerating = false;
      if (observer) observer.disconnect();
      if (pollInterval) clearInterval(pollInterval);
      if (checkTimeout) clearTimeout(checkTimeout);
      resolve(result);
    };

    // 1. 每隔 1 秒主动轮询页面上的 <img> (应对后期修改 src 的骨架屏/懒加载)
    pollInterval = setInterval(() => {
      if (window._geminiQueueAbort) return cleanupAndResolve('aborted');

      const currentImgs = document.querySelectorAll('img');
      for (const img of currentImgs) {
        if (img.src && !img.src.includes('avatar') && !img.src.includes('data:image/svg') && !existingImgSrcs.has(img.src)) {
          // Найдено了不在初始快照里的实底新图片
          cleanupAndResolve('success');
          return;
        }
      }
    }, 1000);

    // 2. 依然保留 MutationObserver，用于监听文字判断失败关键词
    const targetNode = document.body;
    // 增加 attributes: true 能够监听到图片 src 被后期赋值
    const config = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['src'] };

    const callback = function(mutationsList) {
      if (!isGenerating) return;
      if (window._geminiQueueAbort) return cleanupAndResolve('aborted');

      for (let mutation of mutationsList) {
        // 新节点插入：主要为了检测是否出现了拦截关键词
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const textContent = node.textContent || "";
              if (site.failKeywords.some(kw => textContent.includes(kw))) {
                cleanupAndResolve('failed');
                return;
              }
            }
          });
        }
      }
    };

    observer = new MutationObserver(callback);
    observer.observe(targetNode, config);

    // 3. 超时断开检测
    checkTimeout = setTimeout(() => {
      cleanupAndResolve(observerTimeoutMs < QUEUE_CONFIG.timeoutMs ? 'interval_reached' : 'timeout');
    }, observerTimeoutMs);
  });
}

// --- ChatGPT: 组合检测（DOM 稳定性 + 轮询 img） ---
function startObserverChatGPT(site, maxWaitMs = QUEUE_CONFIG.timeoutMs) {
  return new Promise((resolve) => {
    window._geminiAddLog(`[ChatGPT] 开启组合检测 (轮询img + DOM稳定性)...`, 'info');
    const observerTimeoutMs = Math.max(0, maxWaitMs);

    const beforeImgSrcs = _getExistingImageSrcs();
    let resolved = false;
    let lastMutationTime = Date.now();
    let mutationStarted = false; // AI 是否已старт回复（首次 DOM 变化）
    const DOM_STABLE_THRESHOLD = 5000; // DOM 连续 5 秒无变化视为完成

    function done(result) {
      if (resolved) return;
      resolved = true;
      observer.disconnect();
      clearInterval(pollInterval);
      clearTimeout(globalTimeout);
      resolve(result);
    }

    // 方法 1: MutationObserver 跟踪 DOM 变化时间
    const observer = new MutationObserver((mutations) => {
      if (resolved) return;

      if (window._geminiQueueAbort) {
        done('aborted');
        return;
      }

      lastMutationTime = Date.now();
      mutationStarted = true;

      // 检查失败关键词
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const text = node.textContent || '';
              if (site.failKeywords.some(kw => text.includes(kw))) {
                window._geminiAddLog('检测到失败关键词', 'warn');
                done('failed');
              }
            }
          });
        }
      }
    });

    observer.observe(document.body, {
      childList: true, subtree: true, characterData: true, attributes: true
    });

    // 方法 2: 每秒轮询检查新增图片 + DOM 稳定性
    const pollInterval = setInterval(() => {
      if (resolved) return;

      if (window._geminiQueueAbort) {
        done('aborted');
        return;
      }

      // 检查新图片
      const currentImgs = document.querySelectorAll('img');
      for (const img of currentImgs) {
        if (img.src && !beforeImgSrcs.has(img.src) && !img.src.includes('avatar') && !img.src.includes('data:image/svg')) {
          window._geminiAddLog('轮询检测到新图片', 'info');
          done('success');
          return;
        }
      }

      // DOM 稳定性检测：AI старт回复后，连续 N 秒无 DOM 变化
      if (mutationStarted) {
        const silentMs = Date.now() - lastMutationTime;
        if (silentMs >= DOM_STABLE_THRESHOLD) {
          window._geminiAddLog(`DOM 已稳定 ${(silentMs / 1000).toFixed(1)}s，判定生成完成`, 'info');
          done('success');
          return;
        }
      }
    }, 1000);

    // 全局超时
    const globalTimeout = setTimeout(() => {
      if (!resolved) {
        window._geminiAddLog('Таймаут ожидания', 'warn');
        done('timeout');
      }
    }, observerTimeoutMs);
  });
}

// --- 调度入口 ---
function startObserver(maxWaitMs = QUEUE_CONFIG.timeoutMs) {
  const site = getSiteConfig();
  if (site === SITE_CONFIGS.chatgpt) {
    return startObserverChatGPT(site, maxWaitMs);
  }
  return startObserverDefault(site, maxWaitMs);
}

// ========== 格式化时间 ==========
function formatElapsed(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}分${sec}秒`;
}

// ========== Автоматически создаю новый чат ==========
function getNewChatInterval() {
  const input = document.getElementById('gemini-newchat-interval');
  const val = parseInt(input?.value, 10);
  return (val && val > 0) ? val : 0; // 0 = 不启用
}

function getTaskIntervalSettings() {
  const intervalInput = document.getElementById('gemini-task-interval');
  const jitterInput = document.getElementById('gemini-task-jitter');

  const baseMinutes = parseFloat(intervalInput?.value);
  const jitterMinutes = parseFloat(jitterInput?.value);

  return {
    baseMinutes: Number.isFinite(baseMinutes) && baseMinutes > 0 ? baseMinutes : 0,
    jitterMinutes: Number.isFinite(jitterMinutes) && jitterMinutes > 0 ? jitterMinutes : 0,
  };
}

function getGenerationControlSettings() {
  const timeoutSecInput = document.getElementById('gemini-wait-timeout-sec');
  const settleSecInput = document.getElementById('gemini-settle-sec');
  const retryInput = document.getElementById('gemini-retry-attempts');

  const timeoutSec = parseFloat(timeoutSecInput?.value);
  const settleSec = parseFloat(settleSecInput?.value);
  const retryAttempts = parseInt(retryInput?.value, 10);

  return {
    timeoutMs: (Number.isFinite(timeoutSec) && timeoutSec >= 20 ? timeoutSec : 120) * 1000,
    settleAfterSuccessMs: (Number.isFinite(settleSec) && settleSec >= 0 ? settleSec : 10) * 1000,
    retryAttempts: Number.isFinite(retryAttempts) && retryAttempts >= 0 ? retryAttempts : 2,
  };
}

function sampleTaskIntervalMs(settings = getTaskIntervalSettings()) {
  if (!settings.baseMinutes) return 0;

  const jitter = settings.jitterMinutes
    ? (Math.random() * 2 - 1) * settings.jitterMinutes
    : 0;
  const sampledMinutes = Math.max(0, settings.baseMinutes + jitter);
  return Math.round(sampledMinutes * 60 * 1000);
}

async function waitUntilTimestamp(targetTimestamp, buttonId, idleText, countdownPrefix, currentTaskIndex, totalTasks) {
  if (!targetTimestamp || window._geminiQueueAbort) return;

  const btn = document.getElementById(buttonId);
  const totalDurationMs = Math.max(1, targetTimestamp - Date.now());

  while (!window._geminiQueueAbort) {
    await waitWhilePaused();
    if (window._geminiQueueAbort) break;

    const remainingMs = targetTimestamp - Date.now();
    if (remainingMs <= 0) break;

    const remainingSec = Math.ceil(remainingMs / 1000);
    const progress = ((totalDurationMs - remainingMs) / totalDurationMs) * 100;

    if (window._updateDashboardProgress) {
      window._updateDashboardProgress(currentTaskIndex, totalTasks);
    }
    if (btn) {
      btn.innerText = `${countdownPrefix} ${remainingSec}s`;
      btn.style.background = `linear-gradient(90deg, rgba(255,255,255,0.15) ${progress}%, transparent ${progress}%), linear-gradient(135deg, #e53935, #c62828)`;
    }
    await sleep(Math.min(1000, remainingMs));
  }

  if (btn && !window._geminiQueueAbort) {
    btn.innerText = idleText;
    btn.style.background = '';
  }
}

async function openNewChat() {
  const site = getSiteConfig();

  // 尝试Найдено一个真实可见的“新建会话”按钮
  const selectors = site.newChatButtonSelector.split(',').map(s => s.trim());
  let newChatBtn = null;
  for (const sel of selectors) {
    try {
      const btns = Array.from(document.querySelectorAll(sel));
      // 找面积 > 0 的（即没有被 display:none 或隐藏的）
      newChatBtn = btns.find(b => b.offsetWidth > 0 && b.offsetHeight > 0);
      if (newChatBtn) break;
      if (!newChatBtn && btns.length > 0) newChatBtn = btns[0];
    } catch(e) {}
  }

  if (!newChatBtn) {
    window._geminiAddLog('⚠️ 未Найдено“新建会话”按钮，无法执行自动新建', 'warn');
    return;
  }

  window._geminiAddLog('🔄 Нажимаю «Новый чат»...', 'info');
  newChatBtn.click();

  // 等待新会话加载
  await sleep(3000);

  // 等待输入框出现（最多再等 10s）
  for (let i = 0; i < 20; i++) {
    const input = document.querySelector(site.inputSelector);
    if (input) {
      window._geminiAddLog('✅ Новый чат готов', 'info');
      return;
    }
    await sleep(500);
  }
  window._geminiAddLog('⚠️ Новый чат грузится слишком долго, пробую продолжить...', 'warn');
}


// ========== COLLECT GENERATED IMAGES FOR ZIP ==========
window._geminiCollectedImages = window._geminiCollectedImages || [];
window._geminiCollectedImageKeys = window._geminiCollectedImageKeys || new Set();
window._geminiQueueBaselineImageKeys = window._geminiQueueBaselineImageKeys || new Set();

function _getImageKeyFromSrc(src) {
  if (!src) return '';
  try {
    if (src.startsWith('data:')) return `data:${src.length}:${src.slice(0,160)}`;
    // Strip volatile size/cache suffixes so the same Google image is recognized
    // even if Gemini swaps thumbnail/full-size variants.
    const u = new URL(src, window.location.href);
    if (u.hostname.includes('googleusercontent.com')) {
      u.search = '';
      u.hash = '';
      const eq = u.href.lastIndexOf('=');
      return eq !== -1 ? u.href.slice(0, eq) : u.href;
    }
    return u.href;
  } catch (_) {
    return src;
  }
}

function _getCandidateGeneratedImages() {
  let imgs = Array.from(document.querySelectorAll(
    'generated-image img, img.image.loaded, img[src*="googleusercontent.com"], img[src^="blob:https://gemini.google.com"], img[src^="data:image"]'
  ));
  return imgs.filter(img => {
    const src = img.currentSrc || img.src || '';
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    if (!src) return false;
    if (src.includes('favicon') || src.includes('avatar') || src.includes('googlelogo') || src.includes('logo')) return false;
    if (src.includes('gstatic.com')) return false;
    if (w < 256 || h < 256) return false;
    return true;
  });
}

function resetGeneratedImageCollectorForQueue() {
  window._geminiCollectedImages = [];
  window._geminiCollectedImageKeys = new Set();
  window._geminiQueueBaselineImageKeys = new Set(
    _getCandidateGeneratedImages().map(img => _getImageKeyFromSrc(img.currentSrc || img.src || '')).filter(Boolean)
  );
  if (window._geminiAddLog) {
    window._geminiAddLog(`🧹 ZIP-накопитель сброшен. Старых картинок в текущем DOM: ${window._geminiQueueBaselineImageKeys.size}`, 'info');
  }
}

async function _blobToDataUrl(blob) {
  return await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

async function collectGeneratedImagesForZip(taskIndex = 0) {
  // Collect all large images currently visible in the page after each prompt.
  // This avoids Gemini later unloading older images from the DOM; ZIP uses the
  // stored copies, not only the last visible image.
  let imgs = _getCandidateGeneratedImages();

  let added = 0;
  for (const img of imgs) {
    const rawSrc = img.currentSrc || img.src || '';
    const baselineKey = _getImageKeyFromSrc(rawSrc);
    if (baselineKey && window._geminiQueueBaselineImageKeys.has(baselineKey)) continue;
    const src = rawSrc;
    try {
      let dataUrl = '';
      if (src.startsWith('data:image/')) {
        dataUrl = src;
      } else if (src.startsWith('blob:')) {
        const blob = await fetch(src).then(r => r.blob());
        if (!blob || !blob.type.startsWith('image/') || blob.size < 50000) continue;
        dataUrl = await _blobToDataUrl(blob);
      } else {
        // Store remote URL; ZIP button will fetch through background later.
        dataUrl = src;
      }
      const key = dataUrl.startsWith('data:') ? `${dataUrl.length}:${dataUrl.slice(0,160)}` : dataUrl;
      if (window._geminiCollectedImageKeys.has(key)) continue;
      window._geminiCollectedImageKeys.add(key);
      window._geminiCollectedImages.push({ src: dataUrl, taskIndex, collectedAt: Date.now() });
      added++;
    } catch (e) {}
  }
  if (added > 0 && window._geminiAddLog) {
    window._geminiAddLog(`📌 Добавлено в ZIP-накопитель: ${added}; всего: ${window._geminiCollectedImages.length}`, 'success');
  }
  return added;
}


async function collectWithSettle(taskIndex = 0, settleMs = QUEUE_CONFIG.settleAfterSuccessMs) {
  if (settleMs > 0) {
    window._geminiAddLog(`⏳ Даю Gemini дописать картинку: ${Math.ceil(settleMs / 1000)}s`, 'info');
    await sleep(settleMs);
  }
  return await collectGeneratedImagesForZip(taskIndex);
}

function _promptShort(promptText) {
  return String(promptText || '').replace(/\s+/g, ' ').slice(0, 80);
}

async function runSinglePromptJob({ promptText, displayIndex, totalTasks, taskIndexForZip, progressBar, controlSettings = getGenerationControlSettings(), isRetry = false }) {
  const beforeCollectedCount = Array.isArray(window._geminiCollectedImages) ? window._geminiCollectedImages.length : 0;
  window._geminiAddLog(`${isRetry ? '🔁 Повтор' : '▶'} Задача ${displayIndex}/${totalTasks} старт: ${_promptShort(promptText)}`, isRetry ? 'warn' : 'info');
  if (progressBar) progressBar.style.width = `${((displayIndex - 1) / totalTasks) * 100}%`;
  if (window._updateDashboardProgress) window._updateDashboardProgress(displayIndex, totalTasks);
  if (window._geminiOnPromptStart) window._geminiOnPromptStart();

  const promptStartTime = Date.now();
  const inputSuccess = await executeInput(promptText, 0, displayIndex, totalTasks);
  if (!inputSuccess) return { ok: false, reason: 'input_failed', elapsed: Date.now() - promptStartTime, added: 0 };

  const waitStart = Date.now();
  await sleep(1000);
  const result = await startObserver(controlSettings.timeoutMs);
  const generateElapsed = Date.now() - waitStart;
  const elapsed = Date.now() - promptStartTime;
  if (result === 'aborted') return { ok: false, reason: 'aborted', elapsed, added: 0 };

  const statusMap = {
    success: ['🎉', 'найден новый результат', 'success'],
    failed: ['❌', 'генерация не удалась / заблокирована', 'error'],
    timeout: ['⏳', 'таймаут ожидания', 'warn'],
    interval_reached: ['⏭', 'достигнут интервал, проверяю картинку', 'warn'],
  };
  const [icon, text, type] = statusMap[result] || ['❓', String(result), 'info'];
  window._geminiAddLog(`${icon} Задача ${displayIndex}: ${text} (ожидание ${formatElapsed(generateElapsed)} / всего ${formatElapsed(elapsed)})`, type);

  let added = 0;
  if (result === 'success' || result === 'interval_reached') added = await collectWithSettle(taskIndexForZip, controlSettings.settleAfterSuccessMs);
  else added = await collectGeneratedImagesForZip(taskIndexForZip);

  const afterCollectedCount = Array.isArray(window._geminiCollectedImages) ? window._geminiCollectedImages.length : beforeCollectedCount;
  const realAdded = Math.max(added, afterCollectedCount - beforeCollectedCount);
  if (realAdded > 0) {
    window._geminiAddLog(`✅ Задача ${displayIndex}: картинка сохранена, номер промта ${String(taskIndexForZip).padStart(3, '0')}`, 'success');
    return { ok: true, reason: result, elapsed, generateElapsed, added: realAdded };
  }
  window._geminiAddLog(`⚠️ Задача ${displayIndex}: картинка не найдена, промт пойдёт в повтор`, 'warn');
  return { ok: false, reason: result || 'no_image_collected', elapsed, generateElapsed, added: 0 };
}

// ========== 主队列执行 ==========
async function runGeminiQueue() {
  const rawPrompts = document.getElementById('gemini-prompt-input').value;
  const prompts = rawPrompts.split('\n').map(p => p.trim()).filter(p => p !== '');

  if (prompts.length === 0) {
    window._geminiAddLog('⚠️ Сначала введи хотя бы один промт！', 'warn');
    return;
  }

  const prefix = (document.getElementById('gemini-prefix-input')?.value || '').trim();
  const suffix = (document.getElementById('gemini-suffix-input')?.value || '').trim();
  const progressBar = document.getElementById('gemini-progress-fill');

  progressBar.style.width = '0%';
  if (window._updateDashboardProgress) window._updateDashboardProgress(0, prompts.length);

  window._geminiQueueAbort = false;
  window._geminiQueuePaused = false;
  window._geminiIsRunning = true;
  resetGeneratedImageCollectorForQueue();
  await acquireWakeLock();

  const queueStartTime = Date.now();
  const site = getSiteConfig();
  const intervalSettings = getTaskIntervalSettings();
  const controlSettings = getGenerationControlSettings();
  window._geminiAddLog(`🚀 [${site.name}] Очередь запущена: ${prompts.length} промтов. Контроль: ждём картинку, собираем, неудачные повторяем.`, 'success');
  window._geminiAddLog(`⚙️ Настройки: максимум ожидания ${Math.round(controlSettings.timeoutMs/1000)}s, пауза после картинки ${Math.round(controlSettings.settleAfterSuccessMs/1000)}s, повторов ${controlSettings.retryAttempts}`, 'info');
  if (prefix) window._geminiAddLog(`Префикс: "${prefix}"`, 'info');
  if (suffix) window._geminiAddLog(`Суффикс: "${suffix}"`, 'info');

  if (window._geminiOnQueueStart) window._geminiOnQueueStart();

  let totalGenerationTime = 0;
  let successfulTasks = 0;
  const failedJobs = [];

  for (let i = 0; i < prompts.length; i++) {
    await waitWhilePaused();
    if (window._geminiQueueAbort) {
      window._geminiAddLog(`⏹ Очередь остановлена (готово ${i}/${prompts.length})`, 'warn');
      break;
    }

    const fullPrompt = [prefix, prompts[i], suffix].filter(Boolean).join(' ');
    const runResult = await runSinglePromptJob({
      promptText: fullPrompt,
      displayIndex: i + 1,
      totalTasks: prompts.length,
      taskIndexForZip: i + 1,
      progressBar,
      controlSettings,
    });
    if (runResult.reason === 'aborted') break;
    if (runResult.ok) {
      totalGenerationTime += runResult.generateElapsed || runResult.elapsed;
      successfulTasks++;
      const avgMs = Math.floor(totalGenerationTime / successfulTasks);
      if (window._updateDashboardAverage) window._updateDashboardAverage(formatElapsed(avgMs));
    } else {
      failedJobs.push({ index: i + 1, prompt: fullPrompt, reason: runResult.reason });
    }

    const newChatN = getNewChatInterval();
    if (newChatN > 0 && (i + 1) % newChatN === 0 && !window._geminiQueueAbort) {
      window._geminiAddLog(`📌 готово ${i + 1} задач, открываю новый чат...`, 'info');
      await openNewChat();
    }

    const sampledIntervalMs = i < prompts.length - 1 ? sampleTaskIntervalMs(intervalSettings) : 0;
    if (sampledIntervalMs > 0 && !window._geminiQueueAbort) {
      const nextStartTimestamp = Date.now() + sampledIntervalMs;
      window._geminiAddLog(`⏳ Пауза перед следующим промтом: ${formatElapsed(sampledIntervalMs)}`, 'info');
      await waitUntilTimestamp(nextStartTimestamp, 'gemini-auto-runner-btn', '⏸ Пауза', '⏸ Следующий старт через', i + 1, prompts.length);
    }
  }

  for (let attempt = 1; attempt <= controlSettings.retryAttempts && failedJobs.length > 0 && !window._geminiQueueAbort; attempt++) {
    const retryBatch = failedJobs.splice(0, failedJobs.length);
    window._geminiAddLog(`🔁 Повтор неудачных промтов: попытка ${attempt}/${controlSettings.retryAttempts}, промтов: ${retryBatch.length}`, 'warn');
    for (const job of retryBatch) {
      await waitWhilePaused();
      if (window._geminiQueueAbort) break;
      const retryResult = await runSinglePromptJob({
        promptText: job.prompt,
        displayIndex: job.index,
        totalTasks: prompts.length,
        taskIndexForZip: job.index,
        progressBar,
        controlSettings,
        isRetry: true,
      });
      if (retryResult.reason === 'aborted') break;
      if (retryResult.ok) {
        totalGenerationTime += retryResult.generateElapsed || retryResult.elapsed;
        successfulTasks++;
        const avgMs = Math.floor(totalGenerationTime / successfulTasks);
        if (window._updateDashboardAverage) window._updateDashboardAverage(formatElapsed(avgMs));
      } else {
        failedJobs.push({ ...job, reason: retryResult.reason });
      }
    }
  }

  const totalElapsed = Date.now() - queueStartTime;
  if (!window._geminiQueueAbort) {
    progressBar.style.width = '100%';
    if (window._updateDashboardProgress) window._updateDashboardProgress(prompts.length, prompts.length);
    if (failedJobs.length > 0) {
      window._geminiAddLog(`⚠️ Очередь завершена, но не реализованы промты: ${failedJobs.map(j => String(j.index).padStart(3, '0')).join(', ')}`, 'warn');
    } else {
      window._geminiAddLog(`🎉 Всё готово: все ${prompts.length} промтов реализованы. Общее время ${formatElapsed(totalElapsed)}`, 'success');
    }
  }

  window._geminiIsRunning = false;
  window._geminiQueuePaused = false;
  await releaseWakeLock();
  if (window._geminiOnQueueEnd) window._geminiOnQueueEnd();
}

// ========== 图片上传（剪贴板粘贴方式） ==========
async function uploadImageToSite(file) {
  const site = getSiteConfig();
  window._geminiAddLog(`[${site.name}] 正在粘贴图片: ${file.name}`, 'info');

  // Найдено输入区域
  let inputBox = document.querySelector(site.inputSelector);
  if (!inputBox) {
    await sleep(1000);
    inputBox = document.querySelector(site.inputSelector);
  }
  if (!inputBox) {
    window._geminiAddLog('❌ Поле ввода не найдено，无法粘贴图片！', 'error');
    return false;
  }

  inputBox.focus();
  await sleep(300);

  // 构造 ClipboardEvent 模拟粘贴
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);

  const pasteEvent = new ClipboardEvent('paste', {
    bubbles: true,
    cancelable: true,
    clipboardData: dataTransfer,
  });

  inputBox.dispatchEvent(pasteEvent);
  window._geminiAddLog('已模拟粘贴，等待上传确认...', 'info');
  return true;
}

// 等待图片上传完成（固定延时，等待 loading → 预览完成）
async function waitForUploadComplete(delayMs = 10000) {
  window._geminiAddLog(`等待图片上传完成 (${delayMs / 1000}s)...`, 'info');
  const step = 500;
  let waited = 0;
  while (waited < delayMs) {
    if (window._geminiQueueAbort) return 'aborted';
    await sleep(step);
    waited += step;
  }
  window._geminiAddLog('✅ 图片上传等待完成', 'info');
  return 'success';
}

// ========== 图片转换队列 ==========
async function runImageQueue() {
  const files = window._imageQueueFiles || [];
  const prompt = (document.getElementById('gemini-image-prompt')?.value || '').trim();

  if (files.length === 0) {
    window._geminiAddLog('⚠️ 请先选择图片！', 'warn');
    return;
  }
  if (!prompt) {
    window._geminiAddLog('⚠️ 请输入转换提示词！', 'warn');
    return;
  }

  const progressBar = document.getElementById('gemini-progress-fill');

  progressBar.style.width = '0%';
  if (window._updateDashboardProgress) window._updateDashboardProgress(0, files.length);

  window._geminiQueueAbort = false;
  window._geminiQueuePaused = false;
  window._geminiIsRunning = true;

  await acquireWakeLock();

  const queueStartTime = Date.now();
  const site = getSiteConfig();
  const intervalSettings = getTaskIntervalSettings();
  window._geminiAddLog(`🖼 [${site.name}] 图片转换Очередь запущена，共 ${files.length} 张`, 'success');
  window._geminiAddLog(`提示词: "${prompt}"`, 'info');
  if (intervalSettings.baseMinutes > 0) {
    const jitterText = intervalSettings.jitterMinutes > 0 ? `，случайный разброс ±${intervalSettings.jitterMinutes} 分钟` : '';
    window._geminiAddLog(`⏱ Интервал запуска: ${intervalSettings.baseMinutes} 分钟${jitterText}`, 'info');
  } else {
    window._geminiAddLog('⏱ 未设置Интервал запуска，上一张结束后立即старт下一张', 'info');
  }

  if (window._geminiOnQueueStart) window._geminiOnQueueStart();

  for (let i = 0; i < files.length; i++) {
    await waitWhilePaused();

    if (window._geminiQueueAbort) {
      window._geminiAddLog(`⏹ Очередь остановлена (готово ${i}/${files.length})`, 'warn');
      break;
    }

    const file = files[i];
    window._geminiAddLog(`▶ Задача ${i + 1}/${files.length}: ${file.name}`, 'info');

    progressBar.style.width = `${(i / files.length) * 100}%`;
    if (window._updateDashboardProgress) window._updateDashboardProgress(i + 1, files.length);

    if (window._geminiOnPromptStart) window._geminiOnPromptStart();

    const promptStartTime = Date.now();
    const sampledIntervalMs = i < files.length - 1 ? sampleTaskIntervalMs(intervalSettings) : 0;
    const nextStartTimestamp = sampledIntervalMs > 0 ? promptStartTime + sampledIntervalMs : 0;
    if (sampledIntervalMs > 0) {
      window._geminiAddLog(`🕒 本Задача启动后 ${formatElapsed(sampledIntervalMs)} до следующей картинки`, 'info');
    }

    // 第一步：上传图片
    const uploadOk = await uploadImageToSite(file);
    if (!uploadOk) {
      window._geminiAddLog(`❌ Задача ${i + 1}: 上传失败，跳过`, 'error');
      continue;
    }

    // 第二步：等待上传完成
    const uploadResult = await waitForUploadComplete();
    if (uploadResult === 'aborted') {
      window._geminiAddLog(`⏹ Очередь остановлена (готово ${i}/${files.length})`, 'warn');
      break;
    }

    await sleep(500);

    // 第三步：输入提示词
    const inputSuccess = await executeInput(prompt);

    if (inputSuccess) {
      // 第四步：等待生成完成
      await sleep(1000);
      const observerWaitMs = nextStartTimestamp
        ? Math.max(0, nextStartTimestamp - Date.now())
        : QUEUE_CONFIG.timeoutMs;
      const result = await startObserver(observerWaitMs);
      const elapsed = Date.now() - promptStartTime;

      if (result === 'aborted') {
        window._geminiAddLog(`⏹ Очередь остановлена (готово ${i}/${files.length})`, 'warn');
        break;
      }

      const statusMap = {
        success: { icon: '✅', text: '生成成功', type: 'success' },
        failed: { icon: '⚠️', text: '生成失败', type: 'warn' },
        timeout: { icon: '⏰', text: '生成超时', type: 'warn' },
        interval_reached: { icon: '⏭', text: '达到下一张启动时间，转入下一个Задача', type: 'warn' },
      };
      const info = statusMap[result] || { icon: '❓', text: '未知状态', type: 'info' };
      window._geminiAddLog(`${info.icon} Задача ${i + 1} (${file.name}): ${info.text} (耗时 ${formatElapsed(elapsed)})`, info.type);
    } else {
      window._geminiAddLog(`❌ Задача ${i + 1}: Ввод не удался, пропускаю`, 'error');
    }

    // Автоматически создаю новый чат
    const newChatN = getNewChatInterval();
    if (newChatN > 0 && (i + 1) % newChatN === 0 && !window._geminiQueueAbort) {
      window._geminiAddLog(`📌 готово ${i + 1} 个Задача，Автоматически создаю новый чат...`, 'info');
      await openNewChat();
    }

    if (i < files.length - 1 && nextStartTimestamp && !window._geminiQueueAbort) {
      const remainingMs = nextStartTimestamp - Date.now();
      if (remainingMs > 0) {
        window._geminiAddLog(`⏳ 当前Задачаготово，等待 ${formatElapsed(remainingMs)} до запуска следующей`, 'info');
        await waitUntilTimestamp(nextStartTimestamp, 'gemini-image-runner-btn', '⏸ Пауза', '⏸ 下一张倒数', i + 1, files.length);
      }
    }
  }

  const totalElapsed = Date.now() - queueStartTime;

  if (!window._geminiQueueAbort) {
    progressBar.style.width = '100%';
    if (window._updateDashboardProgress) window._updateDashboardProgress(files.length, files.length);
    window._geminiAddLog(`🎉 图片转换Всё готово！общее время ${formatElapsed(totalElapsed)}`, 'success');
  }

  window._geminiIsRunning = false;
  window._geminiQueuePaused = false;
  await releaseWakeLock();

  if (window._geminiOnQueueEnd) window._geminiOnQueueEnd();
}

// ========== 实验模式队列 ==========
async function runExperimentQueue() {
  const rawPrompts = document.getElementById('gemini-prompt-input').value;
  const allPrompts = rawPrompts.split('\n').map(p => p.trim()).filter(p => p !== '');

  if (allPrompts.length === 0) {
    window._geminiAddLog('⚠️ Сначала введи хотя бы один промт！', 'warn');
    return;
  }

  // 随机抽取最多5个（不重复）
  const count = Math.min(5, allPrompts.length);
  const indices = [];
  const available = allPrompts.map((_, i) => i);
  for (let i = 0; i < count; i++) {
    const randIdx = Math.floor(Math.random() * available.length);
    indices.push(available[randIdx]);
    available.splice(randIdx, 1);
  }
  const experimentPrompts = indices.map(i => allPrompts[i]);

  // 读取前缀/后缀
  const prefix = (document.getElementById('gemini-prefix-input')?.value || '').trim();
  const suffix = (document.getElementById('gemini-suffix-input')?.value || '').trim();

  const progressBar = document.getElementById('gemini-progress-fill');
  progressBar.style.width = '0%';
  if (window._updateDashboardProgress) window._updateDashboardProgress(0, experimentPrompts.length);

  window._geminiQueueAbort = false;
  window._geminiQueuePaused = false;
  window._geminiIsRunning = true;

  await acquireWakeLock();

  const queueStartTime = Date.now();
  const site = getSiteConfig();
  const intervalSettings = getTaskIntervalSettings();
  window._geminiAddLog(`🧪 [${site.name}] 实验模式启动，случайно выбрано ${experimentPrompts.length} 个Задача`, 'success');
  experimentPrompts.forEach((p, i) => {
    window._geminiAddLog(`   ${i + 1}. "${p.substring(0, 50)}${p.length > 50 ? '...' : ''}"`, 'info');
  });
  if (prefix) window._geminiAddLog(`Префикс: "${prefix}"`, 'info');
  if (suffix) window._geminiAddLog(`Суффикс: "${suffix}"`, 'info');
  if (intervalSettings.baseMinutes > 0) {
    const jitterText = intervalSettings.jitterMinutes > 0 ? `，случайный разброс ±${intervalSettings.jitterMinutes} 分钟` : '';
    window._geminiAddLog(`⏱ Интервал запуска: ${intervalSettings.baseMinutes} 分钟${jitterText}`, 'info');
  } else {
    window._geminiAddLog('⏱ 未设置Интервал запуска，上一张结束后立即старт下一张', 'info');
  }

  if (window._geminiOnQueueStart) window._geminiOnQueueStart();

  let totalGenerationTimeExp = 0;
  let successfulTasksExp = 0;

  for (let i = 0; i < experimentPrompts.length; i++) {
    await waitWhilePaused();

    if (window._geminiQueueAbort) {
      window._geminiAddLog(`⏹ 实验已停止 (готово ${i}/${experimentPrompts.length})`, 'warn');
      break;
    }

    const fullPrompt = [prefix, experimentPrompts[i], suffix].filter(Boolean).join(' ');

    window._geminiAddLog(`🧪 实验Задача ${i + 1}/${experimentPrompts.length} старт`, 'info');

    progressBar.style.width = `${(i / experimentPrompts.length) * 100}%`;
    if (window._updateDashboardProgress) window._updateDashboardProgress(i + 1, experimentPrompts.length);

    if (window._geminiOnPromptStart) window._geminiOnPromptStart();

    const promptStartTime = Date.now();
    const sampledIntervalMs = i < experimentPrompts.length - 1 ? sampleTaskIntervalMs(intervalSettings) : 0;
    const nextStartTimestamp = sampledIntervalMs > 0 ? promptStartTime + sampledIntervalMs : 0;
    if (sampledIntervalMs > 0) {
      window._geminiAddLog(`🕒 本Задача启动后 ${formatElapsed(sampledIntervalMs)} до следующей картинки`, 'info');
    }

    const inputSuccess = await executeInput(fullPrompt, 0, i + 1, experimentPrompts.length);

    if (inputSuccess) {
      const waitStart = Date.now();
      await sleep(1000);
      const observerWaitMs = nextStartTimestamp
        ? Math.max(0, nextStartTimestamp - Date.now())
        : QUEUE_CONFIG.timeoutMs;
      const result = await startObserver(observerWaitMs);
      const generateElapsed = Date.now() - waitStart;
      const elapsed = Date.now() - promptStartTime;

      if (result === 'aborted') {
        window._geminiAddLog(`⏹ 实验已停止 (готово ${i}/${experimentPrompts.length})`, 'warn');
        break;
      }

      const statusMap = {
        'success': { icon: '🎉', text: 'Изображение сгенерировано', type: 'success' },
        'failed':  { icon: '❌', text: 'Генерация не удалась / заблокирована', type: 'error' },
        'timeout': { icon: '⏳', text: 'Таймаут ожидания', type: 'warn' },
        'interval_reached': { icon: '⏭', text: '达到下一张启动时间，转入下一个Задача', type: 'warn' },
      };
      const info = statusMap[result] || { icon: '❓', text: result, type: 'info' };
      window._geminiAddLog(`${info.icon} 实验 ${i + 1}: ${info.text} (время генерации ${formatElapsed(generateElapsed)} / общее время ${formatElapsed(elapsed)})`, info.type);

      if (result === 'success') {
        totalGenerationTimeExp += generateElapsed;
        successfulTasksExp++;
        const avgMs = Math.floor(totalGenerationTimeExp / successfulTasksExp);
        if (window._updateDashboardAverage) window._updateDashboardAverage(formatElapsed(avgMs));
      }
    } else {
      window._geminiAddLog(`❌ 实验 ${i + 1}: Ввод не удался, пропускаю`, 'error');
    }

    // Автоматически создаю новый чат
    const newChatN = getNewChatInterval();
    if (newChatN > 0 && (i + 1) % newChatN === 0 && !window._geminiQueueAbort) {
      window._geminiAddLog(`📌 готово ${i + 1} 个Задача，Автоматически создаю новый чат...`, 'info');
      await openNewChat();
    }

    if (i < experimentPrompts.length - 1 && nextStartTimestamp && !window._geminiQueueAbort) {
      const remainingMs = nextStartTimestamp - Date.now();
      if (remainingMs > 0) {
        window._geminiAddLog(`⏳ 当前Задачаготово，等待 ${formatElapsed(remainingMs)} до запуска следующей`, 'info');
        await waitUntilTimestamp(nextStartTimestamp, 'gemini-text-pause-btn', '⏸ 暂停实验', '⏸ 下一张倒数', i + 1, experimentPrompts.length);
      }
    }
  }

  const totalElapsed = Date.now() - queueStartTime;

  if (!window._geminiQueueAbort) {
    progressBar.style.width = '100%';
    if (window._updateDashboardProgress) window._updateDashboardProgress(experimentPrompts.length, experimentPrompts.length);
    window._geminiAddLog(`🧪 实验完成！共生成 ${experimentPrompts.length} 张图，общее время ${formatElapsed(totalElapsed)}`, 'success');
    window._geminiAddLog('💡 请查看生成效果，满意后可启动完整队列', 'info');
  }

  window._geminiIsRunning = false;
  window._geminiQueuePaused = false;
  await releaseWakeLock();

  if (window._geminiOnQueueEnd) window._geminiOnQueueEnd();
}
