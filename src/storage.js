export const defaults = {
  provider: 'browser', rate: 1, volume: 1, theme: 'light', autoScroll: true,
  voices: {}, configs: {
    elevenlabs: { key: '', model: 'eleven_multilingual_v2', stability: 0.5, similarity: 0.75 },
    azure: { key: '', region: 'eastus' }, google: { key: '' },
    local: { key: '', endpoint: 'http://localhost:8880/v1', model: 'kokoro', manualVoice: '' },
  },
};

export async function loadSettings() {
  const { settings = {} } = await chrome.storage.local.get('settings');
  return { ...defaults, ...settings, voices: { ...settings.voices }, configs: Object.fromEntries(
    Object.entries(defaults.configs).map(([id, config]) => [id, { ...config, ...settings.configs?.[id] }])
  ) };
}

export async function saveSettings(settings) {
  // Local storage is intentionally used instead of sync: credentials stay in this profile.
  await chrome.storage.local.set({ settings });
}

export async function loadLibrary() {
  return (await chrome.storage.local.get('library')).library || [];
}

export async function saveDocument(doc) {
  const library = await loadLibrary();
  const next = mergeDocument(doc, library);
  await chrome.storage.local.set({ library: next, currentDocumentId: doc.id });
  return next;
}

export function mergeDocument(doc, library) {
  const item = { ...doc, updatedAt: Date.now() };
  // Bound local storage use; each saved document is limited by MAX_TEXT as well.
  const next = [item, ...library.filter(x => x.id !== doc.id)].slice(0, 8);
  // Chrome local storage has a 10 MB quota. Measure UTF-8 rather than characters
  // so books in CJK and other multibyte scripts receive the same protection.
  const encoder = new TextEncoder();
  while (next.length > 1 && encoder.encode(JSON.stringify(next)).length > 7_000_000) next.pop();
  return next;
}
