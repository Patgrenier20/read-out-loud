import { providers, listVoices, listModels, permissionOrigin } from './providers.js';
import { loadSettings, saveSettings, loadLibrary, saveDocument, mergeDocument } from './storage.js';
import { normalizeText, splitText } from './text.js';
import { importDocument } from './documents.js';
import { Player } from './player.js';

const $ = id => document.getElementById(id);
let settings, documentState, voices = [], chunks = [], library = [], voiceGeneration = 0;
let renderedStart = 0, renderedEnd = 0, saveTimer, saveQueue = Promise.resolve();
let previewPlayer;

function notice(message, error = false) {
  $('notice').textContent = message;
  $('notice').classList.toggle('error', error);
  $('notice').hidden = !message;
}
const report = error => notice(error.message || String(error), true);
function option(value, label) { const element = new Option(label, value); return element; }
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const player = new Player({
  onState(state) {
    const labels = { idle: 'READY WHEN YOU ARE', loading: 'PREPARING YOUR VOICE…', playing: 'A LITTLE TIME TO LISTEN', paused: 'TAKE YOUR TIME', finished: 'A GOOD PLACE TO FINISH' };
    $('playback-state').textContent = labels[state] || state;
    $('play').textContent = state === 'playing' ? 'Ⅱ' : state === 'loading' ? '…' : '▶';
    $('play').setAttribute('aria-label', state === 'playing' ? 'Pause' : 'Play');
    $('play').disabled = !chunks.length || state === 'loading';
  },
  onIndex(index) {
    if (documentState) { documentState.index = index; scheduleSave(); }
    $('progress').value = index;
    $('progress-label').textContent = `${chunks.length ? index + 1 : 0} / ${chunks.length}`;
    highlight(index);
  },
  onError: report,
});

function stopAll() { player.stop(); previewPlayer?.stop(); }
function configurePlayer(target = player) {
  target.configure({ provider: settings.provider, config: settings.configs[settings.provider],
    voice: voices.find(v => v.id === $('voice').value), rate: Number(settings.rate), volume: Number(settings.volume) });
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { void persistDocument().catch(report); }, 400);
}
function persistDocument() {
  clearTimeout(saveTimer);
  if (!documentState) return Promise.resolve();
  const snapshot = structuredClone(documentState);
  // Serialize writes so a late progress save cannot overwrite a newer document.
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    library = await saveDocument(snapshot);
    renderShelf();
  });
  return saveQueue;
}

function showView(view) {
  document.querySelectorAll('.view').forEach(node => { node.hidden = node.id !== `${view}-view`; });
  document.querySelectorAll('.tab').forEach(node => {
    node.classList.toggle('active', node.dataset.view === view);
    if (node.dataset.view === view) node.setAttribute('aria-current', 'page'); else node.removeAttribute('aria-current');
  });
}

function renderText(center = 0) {
  const root = $('reader-text');
  root.replaceChildren();
  // A bounded window keeps large books responsive instead of inserting thousands
  // of DOM nodes. Explicit navigation still reaches every section in the book.
  renderedStart = Math.max(0, center - 30);
  renderedEnd = Math.min(chunks.length, renderedStart + 100);
  if (renderedStart > 0) {
    const previous = el('button', 'text-button load-more', '↑ Earlier sections');
    previous.onclick = () => renderText(Math.max(0, renderedStart - 60));
    root.append(previous);
  }
  const fragment = document.createDocumentFragment();
  for (let index = renderedStart; index < renderedEnd; index++) {
    const button = el('button', 'reader-chunk', chunks[index]);
    button.dataset.index = index;
    button.setAttribute('aria-label', `Read section ${index + 1}: ${chunks[index].slice(0, 70)}`);
    if (index === player.index) { button.classList.add('current'); button.setAttribute('aria-current', 'true'); }
    button.addEventListener('click', () => player.seek(index));
    fragment.append(button);
  }
  root.append(fragment);
  if (renderedEnd < chunks.length) {
    const next = el('button', 'text-button load-more', 'Later sections ↓');
    next.onclick = () => renderText(renderedEnd + 20);
    root.append(next);
  }
}

function highlight(index) {
  if (!chunks.length) return;
  if (settings?.autoScroll && (index < renderedStart || index >= renderedEnd)) renderText(index);
  document.querySelectorAll('.reader-chunk.current').forEach(node => {
    node.classList.remove('current'); node.removeAttribute('aria-current');
  });
  const node = $('reader-text').querySelector(`[data-index="${index}"]`);
  if (!node) return;
  node.classList.add('current');
  node.setAttribute('aria-current', 'true');
  if (settings?.autoScroll) {
    const root = $('reader-text');
    // Scroll just the reading area: scrollIntoView can move the entire side panel.
    root.scrollTop = Math.max(0, node.offsetTop - root.offsetTop - 36);
  }
}

async function openDocument(doc) {
  const text = normalizeText(doc.text);
  const nextChunks = splitText(text);
  if (!nextChunks.length) throw new Error('No readable text found on this page. Try selecting some text or opening a file.');
  await persistDocument();
  stopAll();
  documentState = { ...doc, text, id: doc.id || crypto.randomUUID(), index: doc.index || 0, bookmarks: doc.bookmarks || [] };
  document.body.classList.add('has-document');
  chunks = nextChunks;
  $('document-title').textContent = doc.title || 'Untitled read';
  const words = text.split(/\s+/u).length;
  $('document-meta').textContent = `${words.toLocaleString()} words · about ${Math.max(1, Math.round(words / 180))} min at 1×`;
  $('progress').max = chunks.length - 1;
  for (const id of ['play', 'progress', 'previous', 'next', 'bookmark']) $(id).disabled = false;
  player.load(chunks, doc.index);
  renderText(player.index);
  highlight(player.index);
  renderBookmarks();
  showView('reader');
  await persistDocument();
}

function renderBookmarks() {
  $('bookmarks').replaceChildren();
  for (const index of documentState?.bookmarks || []) {
    const button = el('button', 'bookmark-chip', `⌑ ${index + 1}`);
    button.title = `${chunks[index]?.slice(0, 120) || ''} (Shift-click to remove)`;
    button.setAttribute('aria-label', `Bookmark at section ${index + 1}. Shift-click to remove.`);
    button.onclick = event => {
      if (event.shiftKey) {
        documentState.bookmarks = documentState.bookmarks.filter(x => x !== index);
        renderBookmarks(); scheduleSave();
      } else { player.seek(index); renderText(index); highlight(index); }
    };
    $('bookmarks').append(button);
  }
}

function renderShelf() {
  $('shelf-count').textContent = library.length;
  $('library-list').replaceChildren();
  if (!library.length) $('library-list').append(el('p', 'hint', 'Your shelf is waiting. Read a page or open a file to save your first read.'));
  for (const doc of library) {
    const card = el('div', 'library-card');
    const open = el('button', 'open-read');
    open.append(el('h3', '', doc.title), el('p', '', `Section ${doc.index + 1} · ${doc.bookmarks.length} bookmarks · ${new Date(doc.updatedAt).toLocaleDateString()}`));
    open.onclick = () => { notice(''); void openDocument(doc).catch(report); };
    const remove = el('button', 'icon-button', '×');
    remove.setAttribute('aria-label', `Remove ${doc.title} from shelf`);
    remove.onclick = async () => {
      // Finish in-flight writes before deleting so a pending save cannot revive it.
      await persistDocument().catch(report);
      if (documentState?.id === doc.id) {
        stopAll(); documentState = null; chunks = []; player.load([]);
        document.body.classList.remove('has-document');
        $('document-title').textContent = 'A good read starts here.';
        $('document-meta').textContent = 'Open another read to keep listening.';
        $('reader-text').replaceChildren(); $('bookmarks').replaceChildren();
        for (const id of ['play', 'progress', 'previous', 'next', 'bookmark']) $(id).disabled = true;
        await chrome.storage.local.remove('currentDocumentId');
      }
      library = library.filter(x => x.id !== doc.id);
      await chrome.storage.local.set({ library }); renderShelf();
    };
    card.append(open, remove); $('library-list').append(card);
  }
}

function filterVoices() {
  const search = $('voice-search').value.toLowerCase();
  const selected = settings.voices[settings.provider];
  const filtered = voices.filter(v => `${v.name} ${v.lang} ${v.detail || ''}`.toLowerCase().includes(search));
  $('voice').replaceChildren(...filtered.map(v => option(v.id, `${v.name}${v.lang ? ` · ${v.lang}` : ''}`)));
  if (filtered.some(v => v.id === selected)) $('voice').value = selected;
  else if (selected) $('voice').selectedIndex = -1;
  if (!filtered.length) $('voice').append(option('', voices.length ? 'No matching voices' : 'Connect or refresh to load voices'));
  $('voice-count').textContent = `(${filtered.length})`;
  updateVoiceDetail();
}
function updateVoiceDetail() {
  const voice = voices.find(v => v.id === $('voice').value);
  $('voice-detail').textContent = voice ? voice.detail || (voice.remote ? 'Network voice' : settings.provider === 'browser' ? 'Device voice' : 'Connected voice') : 'Choose a voice to get started.';
  $('preview').disabled = !voice;
}

async function refreshVoices() {
  const token = ++voiceGeneration;
  const provider = settings.provider;
  voices = []; filterVoices();
  $('provider-badge').textContent = provider === 'browser' ? 'FREE' : provider === 'local' ? 'YOUR SERVER' : 'YOUR API KEY';
  $('provider-note').textContent = providers[provider].description;
  if (provider !== 'browser') {
    const allowed = await chrome.permissions.contains({ origins: [permissionOrigin(provider, settings.configs[provider])] });
    if (!allowed) { notice('Open Connections to connect this provider and allow access to its server.'); return; }
  }
  const result = await listVoices(provider, settings.configs[provider]);
  if (token !== voiceGeneration) return;
  voices = result;
  if (!voices.some(v => v.id === settings.voices[provider])) {
    const language = documentState?.lang || navigator.language;
    const preferred = voices.find(v => v.lang?.toLowerCase() === language.toLowerCase()) || voices[0];
    settings.voices[provider] = preferred?.id || '';
    await saveSettings(settings);
  }
  filterVoices();
  if (!voices.length) notice('No voices were returned. Install a system speech voice or check your connected account.');
}

const connectionFields = {
  elevenlabs: [['key', 'API key', 'password'], ['model', 'Model ID', 'text'], ['stability', 'Stability (0–1)', 'number'], ['similarity', 'Similarity (0–1)', 'number']],
  azure: [['key', 'Speech resource key', 'password'], ['region', 'Resource region, e.g. eastus', 'text']],
  google: [['key', 'Google Cloud API key', 'password']],
  local: [['endpoint', 'API base URL (including /v1)', 'url'], ['key', 'API key (optional)', 'password'], ['model', 'Model ID', 'text'], ['manualVoice', 'Voice IDs (optional, comma-separated)', 'text']],
};
const providerDocs = {
  elevenlabs: 'https://elevenlabs.io/app/settings/api-keys',
  azure: 'https://portal.azure.com/', google: 'https://console.cloud.google.com/apis/library/texttospeech.googleapis.com',
  local: 'https://github.com/remsky/Kokoro-FastAPI',
};

function renderConnections() {
  $('connection-cards').replaceChildren();
  const browserCard = el('div', 'connection-card');
  browserCard.append(el('strong', '', 'Browser & system'), el('span', 'badge', ' FREE'), el('p', '', providers.browser.description));
  const refresh = el('button', 'text-button', 'Refresh device voices ↻');
  refresh.onclick = async () => {
    stopAll(); settings.provider = 'browser'; $('provider').value = 'browser';
    await saveSettings(settings); await refreshVoices().catch(report); showView('reader');
  };
  browserCard.append(refresh); $('connection-cards').append(browserCard);
  for (const [id, fields] of Object.entries(connectionFields)) {
    const card = el('details', 'connection-card');
    const summary = el('summary', '', providers[id].name);
    summary.append(el('span', 'badge', id === 'local' ? 'LOCAL / CUSTOM' : 'BRING YOUR KEY'));
    card.append(summary, el('p', '', providers[id].description));
    const form = el('form');
    for (const [name, label, type] of fields) {
      const input = el('input');
      input.id = `${id}-${name}`; input.name = name; input.type = type;
      input.value = settings.configs[id][name];
      input.autocomplete = 'off'; input.spellcheck = false;
      if (type === 'number') { input.min = '0'; input.max = '1'; input.step = '0.05'; }
      if (name === 'model' && id === 'elevenlabs') input.setAttribute('list', 'eleven-models');
      if (name !== 'manualVoice' && !(id === 'local' && name === 'key')) input.required = true;
      const labelNode = el('label', '', label); labelNode.htmlFor = input.id;
      form.append(labelNode, input);
    }
    if (id === 'elevenlabs') { const datalist = el('datalist'); datalist.id = 'eleven-models'; form.append(datalist); }
    const connect = el('button', 'button primary', 'Save & load voices'); connect.type = 'submit';
    const state = el('p', 'connection-state'); state.setAttribute('role', 'status');
    const docs = el('a', '', 'Provider setup ↗'); docs.href = providerDocs[id]; docs.target = '_blank'; docs.rel = 'noopener noreferrer';
    form.append(connect, state, docs); card.append(form); $('connection-cards').append(card);
    form.onsubmit = async event => {
      event.preventDefault();
      const config = Object.fromEntries(new FormData(form));
      connect.disabled = true;
      state.textContent = 'Connecting…';
      try {
        // Must be requested in this click handler before awaiting anything else.
        const allowed = await chrome.permissions.request({ origins: [permissionOrigin(id, config)] });
        if (!allowed) throw new Error('Server permission was not granted. Use Save & load voices to try again.');
        stopAll();
        settings.configs[id] = config; settings.provider = id;
        $('provider').value = id; $('voice-search').value = '';
        await saveSettings(settings);
        await refreshVoices();
        state.textContent = `${voices.length} voices loaded. Ready to listen.`;
        notice(`${providers[id].name} connected. Choose a voice in Reader. Preview and playback use your provider account.`);
        if (id === 'elevenlabs') {
          try { $('eleven-models').replaceChildren(...(await listModels(config)).map(m => option(m.id, m.name))); }
          catch { state.textContent += ' Model discovery unavailable; you can enter a model ID manually.'; }
        }
      } catch (error) { state.textContent = error.message; report(error); }
      finally { connect.disabled = false; }
    };
  }
}

async function readPage() {
  notice('Finding the words on this page…');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('Open a website tab first.');
  if (tab.url && !/^https?:/i.test(tab.url)) throw new Error('Chrome protects this page from extensions. Open a normal website, paste text, or import the document file.');
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['extract.js'] });
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => {
      const result = globalThis.__readOutLoudArticle;
      delete globalThis.__readOutLoudArticle;
      return result;
    } });
    if (!result?.result?.text) throw new Error('No readable text found.');
    await openDocument(result.result);
    notice('Ready to listen. Select text before importing to read just that selection.');
  } catch (error) {
    if (/access|permission|cannot|gallery|frame/i.test(error.message)) throw new Error('Chrome could not access this page. Click the extension toolbar icon on the website and try again. For PDFs, use Open a file.');
    throw error;
  }
}

async function consumePendingRead() {
  const { pendingRead } = await chrome.storage.session.get('pendingRead');
  if (!pendingRead) return;
  await chrome.storage.session.remove('pendingRead');
  await openDocument(pendingRead);
  notice('Your selection is ready. Press play to listen.');
}

async function init() {
  settings = await loadSettings();
  document.body.classList.toggle('dark', settings.theme === 'dark');
  $('provider').replaceChildren(...Object.entries(providers).map(([id, p]) => option(id, p.name)));
  $('provider').value = settings.provider;
  $('rate').value = settings.rate; $('rate-label').textContent = `${Number(settings.rate).toFixed(1).replace('.0', '')}×`;
  $('volume').value = settings.volume; $('auto-scroll').checked = settings.autoScroll;
  renderConnections();
  library = await loadLibrary(); renderShelf();
  const { currentDocumentId } = await chrome.storage.local.get('currentDocumentId');
  const current = library.find(x => x.id === currentDocumentId);
  if (current) await openDocument(current);
  // Windows/Chrome may populate voices shortly after the panel first opens.
  chrome.tts.onVoicesChanged?.addListener(() => {
    if (settings.provider === 'browser') void refreshVoices().catch(report);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes.pendingRead?.newValue) void consumePendingRead().catch(report);
  });

  document.querySelectorAll('.tab').forEach(button => button.onclick = () => showView(button.dataset.view));
  document.querySelector('.brand').onclick = event => { event.preventDefault(); showView('reader'); };
  $('read-page').onclick = () => { void readPage().catch(report); };
  $('open-file').onclick = () => $('file-input').click();
  $('file-input').onchange = async () => {
    const file = $('file-input').files[0]; if (!file) return;
    $('open-file').disabled = true; notice('Opening your file on this device…');
    try { await openDocument(await importDocument(file, notice)); notice('Your file is ready. Press play to listen.'); }
    catch (error) { report(error); }
    finally { $('open-file').disabled = false; $('file-input').value = ''; }
  };
  $('paste-toggle').onclick = () => { $('paste-form').hidden = !$('paste-form').hidden; if (!$('paste-form').hidden) $('paste-text').focus(); };
  $('paste-form').onsubmit = async event => {
    event.preventDefault();
    try {
      const text = normalizeText($('paste-text').value);
      await openDocument({ title: text.split('\n')[0].slice(0, 80), text, url: '' });
      $('paste-form').hidden = true; $('paste-text').value = ''; notice('Your text is ready.');
    } catch (error) { report(error); }
  };
  $('provider').onchange = async () => {
    stopAll(); settings.provider = $('provider').value; $('voice-search').value = ''; notice('');
    await saveSettings(settings); await refreshVoices().catch(report);
  };
  $('voice-search').oninput = filterVoices;
  $('voice').onchange = async () => {
    stopAll(); settings.voices[settings.provider] = $('voice').value; updateVoiceDetail(); await saveSettings(settings);
  };
  $('play').onclick = () => {
    previewPlayer?.stop(); notice('');
    if (player.state === 'playing') player.pause(); else { configurePlayer(); void player.play(); }
  };
  $('stop').onclick = stopAll;
  $('previous').onclick = () => player.seek(player.index - 1);
  $('next').onclick = () => player.seek(player.index + 1);
  $('progress').onchange = () => player.seek(Number($('progress').value));
  $('bookmark').onclick = () => {
    if (!documentState) return;
    if (!documentState.bookmarks.includes(player.index)) documentState.bookmarks.push(player.index);
    documentState.bookmarks.sort((a, b) => a - b); renderBookmarks(); scheduleSave();
  };
  $('rate').oninput = () => {
    const wasPlaying = player.state === 'playing' || player.state === 'loading';
    stopAll(); settings.rate = Number($('rate').value); $('rate-label').textContent = `${settings.rate.toFixed(1).replace('.0', '')}×`;
    configurePlayer(); void saveSettings(settings).catch(report);
    if (wasPlaying) void player.play();
  };
  $('volume').oninput = () => {
    settings.volume = Number($('volume').value); player.audio.volume = settings.volume;
    if (settings.provider === 'browser') { const resume = player.state === 'playing'; player.stop(); configurePlayer(); if (resume) void player.play(); }
    void saveSettings(settings).catch(report);
  };
  $('auto-scroll').onchange = () => { settings.autoScroll = $('auto-scroll').checked; void saveSettings(settings).catch(report); };
  $('theme').onclick = () => {
    settings.theme = settings.theme === 'dark' ? 'light' : 'dark';
    document.body.classList.toggle('dark', settings.theme === 'dark'); void saveSettings(settings).catch(report);
  };
  $('preview').onclick = () => {
    stopAll(); notice('Voice preview. Cloud previews use a small amount of provider credit.');
    previewPlayer = new Player({ onState: () => {}, onIndex: () => {}, onError: report });
    configurePlayer(previewPlayer);
    previewPlayer.load(['A little less scrolling. A little more listening. Welcome to Read Out Loud.']);
    void previewPlayer.play();
  };
  $('clear-keys').onclick = async () => {
    stopAll();
    for (const config of Object.values(settings.configs)) config.key = '';
    settings.provider = 'browser'; $('provider').value = 'browser';
    await saveSettings(settings); renderConnections(); await refreshVoices().catch(report);
    notice('All saved API keys removed. Browser voices are ready.');
  };
  window.addEventListener('pagehide', () => {
    stopAll(); clearTimeout(saveTimer);
    // Issue the write immediately. An async read-then-write can lose its second
    // half when the panel context closes, especially inside the debounce window.
    if (documentState) void chrome.storage.local.set({
      library: mergeDocument(documentState, library), currentDocumentId: documentState.id,
    });
  });
  // Bind controls before provider discovery: a slow network must not block the
  // reader, Stop, or switching back to free voices. Inert prevents startup clicks
  // from disappearing while local settings and the document are still loading.
  document.body.removeAttribute('inert');
  document.documentElement.dataset.ready = 'true';
  await refreshVoices().catch(report);
  await consumePendingRead();
}

void init().catch(report);
