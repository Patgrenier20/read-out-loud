import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { listVoices, synthesize, permissionOrigin } from '../src/providers.js';
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('server permissions use a Chrome host pattern without a port', () => {
  assert.equal(permissionOrigin('local', { endpoint: 'http://localhost:8880/v1' }), 'http://localhost/*');
});

test('ElevenLabs loads every voice page', async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return Response.json({ voices: [{ voice_id: `v${calls.length}`, name: `Voice ${calls.length}` }], has_more: calls.length === 1, next_page_token: 'next' });
  };
  const voices = await listVoices('elevenlabs', { key: 'test-only' });
  assert.equal(voices.length, 2); assert.match(calls[1].url, /next_page_token=next/);
  assert.equal(calls[0].options.headers['xi-api-key'], 'test-only');
  assert.equal(calls[0].options.redirect, 'error');
});
test('Azure sends escaped SSML with region-specific auth', async () => {
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options }; return new Response('mp3', { headers: { 'Content-Type': 'audio/mpeg' } });
  };
  await synthesize('azure', { key: 'test-only', region: 'eastus' }, { id: 'en-US-JennyNeural', lang: 'en-US' }, 'A < B & C');
  assert.match(captured.url, /^https:\/\/eastus.tts.speech.microsoft.com/);
  assert.match(captured.options.body, /A &lt; B &amp; C/);
  assert.equal(captured.options.headers['Ocp-Apim-Subscription-Key'], 'test-only');
});
test('Google decodes base64 audio and keeps keys out of URLs', async () => {
  globalThis.fetch = async (url, options) => {
    assert.ok(!url.includes('test-only'));
    assert.equal(options.headers['X-Goog-Api-Key'], 'test-only');
    return Response.json({ audioContent: btoa('audio') });
  };
  const result = await synthesize('google', { key: 'test-only' }, { id: 'en-US-Standard-A', lang: 'en-US' }, 'Hello');
  assert.equal(await result.text(), 'audio');
});
test('provider errors never include an echoed key or input', async () => {
  globalThis.fetch = async () => new Response('secret-key and private document', { status: 401 });
  await assert.rejects(() => listVoices('google', { key: 'test-only' }), error => /401/.test(error.message) && !/secret-key|private document/.test(error.message));
});
test('local server supports manual voices without a metadata endpoint', async () => {
  globalThis.fetch = () => { throw new Error('should not call'); };
  assert.deepEqual((await listVoices('local', { endpoint: 'http://localhost:8880/v1', manualVoice: 'af_heart, bf_emma' })).map(v => v.id), ['af_heart', 'bf_emma']);
});
