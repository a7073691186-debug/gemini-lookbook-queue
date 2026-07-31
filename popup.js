const $ = (id) => document.getElementById(id);
const state = { items: [], index: 0 };

function parseQueue(text) {
  return text.split(/\r?\n/).map((line, index) => {
    const clean = line.trim();
    if (!clean || clean.startsWith('#')) return null;
    const [slug = '', prompt = '', negative = '', notes = ''] = clean.split('|').map((v) => v.trim());
    if (!slug || !prompt) throw new Error(`Строка ${index + 1}: нужны slug и prompt.`);
    return { slug, prompt, negative, notes };
  }).filter(Boolean);
}

function fullPrompt(item) {
  return item.negative ? `${item.prompt}\n\nAvoid: ${item.negative}` : item.prompt;
}

async function save() { await chrome.storage.local.set({ lookbookQueue: state }); }
async function load() {
  const { lookbookQueue } = await chrome.storage.local.get('lookbookQueue');
  if (lookbookQueue && Array.isArray(lookbookQueue.items)) Object.assign(state, lookbookQueue);
  render();
}
function render(message = '') {
  const item = state.items[state.index];
  $('current').hidden = !item;
  $('queueInput').value = state.items.map((v) => `${v.slug} | ${v.prompt} | ${v.negative} | ${v.notes}`).join('\n');
  if (item) {
    $('counter').textContent = `${state.index + 1} из ${state.items.length}`;
    $('slug').textContent = item.slug;
    $('prompt').textContent = fullPrompt(item);
    $('notes').textContent = item.notes ? `Заметки: ${item.notes}` : '';
  }
  $('status').textContent = message;
}

$('loadQueue').addEventListener('click', async () => {
  try {
    const items = parseQueue($('queueInput').value);
    if (!items.length) throw new Error('Добавь хотя бы одну строку.');
    state.items = items; state.index = 0; await save(); render(`Загружено: ${items.length}.`);
  } catch (error) { render(error.message); }
});
$('clearQueue').addEventListener('click', async () => {
  state.items = []; state.index = 0; await save(); render('Очередь очищена.');
});
$('copyPrompt').addEventListener('click', async () => {
  const item = state.items[state.index]; if (!item) return;
  await navigator.clipboard.writeText(fullPrompt(item)); render(`Скопировано: ${item.slug}. Вставь в Gemini и проверь перед отправкой.`);
});
$('openGemini').addEventListener('click', () => chrome.tabs.create({ url: 'https://gemini.google.com/' }));
$('skip').addEventListener('click', async () => {
  if (state.index < state.items.length - 1) { state.index += 1; await save(); render('Следующий лук.'); }
  else render('Очередь закончилась.');
});
load();
