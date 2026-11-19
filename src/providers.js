import { escapeXml, validateEndpoint } from './text.js';

export const providers = {
  browser: { name: 'Browser & system', description: 'Free · no API key. Voices depend on your device and installed speech engines.' },
  elevenlabs: { name: 'ElevenLabs', description: 'Your account voices, including eligible custom voices. Provider credits apply.' },
  azure: { name: 'Azure Speech', description: 'Microsoft neural voices for your Speech resource region. Provider billing applies.' },
  google: { name: 'Google Cloud TTS', description: 'Google Cloud voices. Enable the Text-to-Speech API and billing in your project.' },
  local: { name: 'Local / custom TTS', description: 'Connect a compatible server such as Kokoro-FastAPI. Running a local model needs no cloud credits.' },
};

export function baseUrl(provider, config) {
  if (provider === 'elevenlabs') return 'https://api.elevenlabs.io';
  if (provider === 'google') return 'https://texttospeech.googleapis.com';
  if (provider === 'azure') {
    if (!/^[a-z0-9-]+$/.test(config.region)) throw new Error('Enter an Azure region such as eastus or uksouth.');
    return `https://${config.region}.tts.speech.microsoft.com`;
  }
  if (provider === 'local') return validateEndpoint(config.endpoint);
  throw new Error('Unknown speech provider.');
}

export function permissionOrigin(provider, config) {
  const url = new URL(baseUrl(provider, config));
  // Chrome match patterns describe hosts, not individual TCP ports.
  return `${url.protocol}//${url.hostname}/*`;
}

function headers(provider, config, contentType) {
  if (provider !== 'local' && !config.key?.trim()) throw new Error('Add your API key in Connections first.');
  const result = {};
  if (contentType) result['Content-Type'] = contentType;
  if (provider === 'elevenlabs') result['xi-api-key'] = config.key.trim();
  if (provider === 'azure') result['Ocp-Apim-Subscription-Key'] = config.key.trim();
  if (provider === 'google') result['X-Goog-Api-Key'] = config.key.trim();
  if (provider === 'local' && config.key?.trim()) result.Authorization = `Bearer ${config.key.trim()}`;
  return result;
}

async function request(url, options = {}, signal) {
  let response;
  try {
    response = await fetch(url, { ...options, redirect: 'error', credentials: 'omit',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000) });
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error.name === 'TimeoutError') throw new Error('The voice server took too long. Try again or choose another voice.');
    throw new Error('Cannot reach the voice server. Check its address, network access, and Chrome site permission.');
  }
  if (!response.ok) {
    // Do not surface raw provider error bodies: some services echo credentials or input.
    const hints = { 400: 'Check the voice, model, language, and provider settings.', 401: 'Check your API key.',
      403: 'Your key, account tier, or project does not allow this request.', 404: 'The voice, model, or endpoint was not found.',
      429: 'Your quota or rate limit was reached. Check provider billing and try later.' };
    throw new Error(`Voice service returned ${response.status}. ${hints[response.status] || 'Try again later.'}`);
  }
  return response;
}

export async function listVoices(provider, config = {}, signal) {
  if (provider === 'browser') {
    const voices = await chrome.tts.getVoices();
    return voices.map(v => ({ id: JSON.stringify([v.voiceName, v.extensionId || '', v.lang || '']),
      name: v.voiceName, lang: v.lang || '', remote: Boolean(v.remote), native: v }));
  }
  const base = baseUrl(provider, config);
  const auth = headers(provider, config);
  if (provider === 'elevenlabs') {
    const voices = [];
    let token;
    const seen = new Set();
    do {
      const query = new URLSearchParams({ page_size: '100' });
      if (token) query.set('next_page_token', token);
      const result = await (await request(`${base}/v2/voices?${query}`, { headers: auth }, signal)).json();
      voices.push(...result.voices.map(v => ({ id: v.voice_id, name: v.name,
        lang: v.labels?.language || '', detail: [v.labels?.accent, v.labels?.gender, v.category].filter(Boolean).join(' · ') })));
      token = result.has_more ? result.next_page_token : null;
      if (token && seen.has(token)) throw new Error('The provider returned a repeated voice page. Please reconnect.');
      if (token) seen.add(token);
    } while (token);
    return voices;
  }
  if (provider === 'azure') {
    const result = await (await request(`${base}/cognitiveservices/voices/list`, { headers: auth }, signal)).json();
    return result.map(v => ({ id: v.ShortName, name: v.LocalName || v.DisplayName, lang: v.Locale, detail: `${v.Gender} · ${v.VoiceType}` }));
  }
  if (provider === 'google') {
    const result = await (await request(`${base}/v1/voices`, { headers: auth }, signal)).json();
    return result.voices.map(v => ({ id: v.name, name: v.name, lang: v.languageCodes?.[0] || '', detail: v.ssmlGender }));
  }
  if (config.manualVoice.trim()) return config.manualVoice.split(',').map(id => ({ id: id.trim(), name: id.trim(), lang: '' })).filter(v => v.id);
  const result = await (await request(`${base}/audio/voices`, { headers: auth }, signal)).json();
  const voices = Array.isArray(result) ? result : result.voices;
  if (!Array.isArray(voices)) throw new Error('The server did not return a voice list. Enter comma-separated voice IDs in Connections.');
  return voices.map(v => typeof v === 'string' ? { id: v, name: v, lang: '' } : { id: v.voice_id || v.id || v.name, name: v.name || v.id, lang: v.language || '' });
}

export async function listModels(config, signal) {
  const result = await (await request('https://api.elevenlabs.io/v1/models', { headers: headers('elevenlabs', config) }, signal)).json();
  return result.filter(m => m.can_do_text_to_speech).map(m => ({ id: m.model_id, name: m.name }));
}

export async function synthesize(provider, config, voice, text, signal) {
  const base = baseUrl(provider, config);
  let url, body, auth = headers(provider, config, 'application/json');
  if (provider === 'elevenlabs') {
    url = `${base}/v1/text-to-speech/${encodeURIComponent(voice.id)}?output_format=mp3_44100_128`;
    body = { text, model_id: config.model, voice_settings: { stability: Number(config.stability), similarity_boost: Number(config.similarity) } };
  } else if (provider === 'azure') {
    url = `${base}/cognitiveservices/v1`;
    auth = { ...headers(provider, config, 'application/ssml+xml'), 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3' };
    body = `<speak version="1.0" xml:lang="${escapeXml(voice.lang)}"><voice name="${escapeXml(voice.id)}">${escapeXml(text)}</voice></speak>`;
  } else if (provider === 'google') {
    url = `${base}/v1/text:synthesize`;
    body = { input: { text }, voice: { name: voice.id, languageCode: voice.lang }, audioConfig: { audioEncoding: 'MP3' } };
  } else {
    url = `${base}/audio/speech`;
    body = { model: config.model, input: text, voice: voice.id, response_format: 'mp3' };
  }
  const response = await request(url, { method: 'POST', headers: auth, body: typeof body === 'string' ? body : JSON.stringify(body) }, signal);
  if (provider === 'google') {
    const { audioContent } = await response.json();
    if (!audioContent) throw new Error('The provider returned no audio.');
    return new Blob([Uint8Array.from(atob(audioContent), x => x.charCodeAt(0))], { type: 'audio/mpeg' });
  }
  const blob = await response.blob();
  if (!blob.size || (!blob.type.startsWith('audio/') && !blob.type.startsWith('application/octet-stream'))) {
    throw new Error('The provider returned an unsupported audio response. Expected MP3 audio.');
  }
  return blob;
}
