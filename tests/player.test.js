import test from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/player.js';

class FakeAudio extends EventTarget {
  pause() { this.paused = true; }
  async play() { this.paused = false; }
  removeAttribute() { this.src = ''; }
}
function setup(generate) {
  const audio = new FakeAudio();
  const states = [], indices = [], errors = [];
  const tts = { stop() {}, pause() {}, resume() {}, speak() {} };
  const player = new Player({ audio, tts, generate, onState: s => states.push(s), onIndex: i => indices.push(i), onError: e => errors.push(e) });
  player.configure({ provider: 'local', config: {}, voice: { id: 'voice' }, rate: 1, volume: 1 });
  player.load(['First.', 'Second.', 'Third.']);
  return { player, audio, states, indices, errors, tts };
}
const blob = () => new Blob(['test-audio'], { type: 'audio/mpeg' });
test('Stop prevents a delayed request from starting audio', async () => {
  let complete;
  const { player, audio } = setup(() => new Promise(resolve => { complete = resolve; }));
  const pending = player.play();
  assert.equal(player.state, 'loading');
  player.stop(); complete(blob()); await pending;
  assert.equal(player.state, 'idle'); assert.ok(audio.paused); assert.equal(audio.src, '');
});
test('skip ignores old request results and plays the new section', async () => {
  const pending = [];
  const { player, audio } = setup((_p, _c, _v, text) => new Promise(resolve => pending.push({ text, resolve })));
  const first = player.play(); player.seek(1);
  assert.deepEqual(pending.map(x => x.text), ['First.', 'Second.']);
  pending[1].resolve(blob()); await new Promise(resolve => setImmediate(resolve));
  const currentUrl = audio.src;
  pending[0].resolve(blob()); await first;
  assert.equal(player.index, 1); assert.equal(audio.src, currentUrl); assert.equal(player.state, 'playing');
  player.stop();
});
test('pause/resume reuses audio instead of billing for another request', async () => {
  let calls = 0;
  const { player, audio } = setup(async () => { calls++; return blob(); });
  await player.play(); player.pause();
  assert.equal(player.state, 'paused'); assert.equal(audio.paused, true);
  await player.play(); assert.equal(calls, 1); assert.equal(audio.paused, false);
  player.stop();
});
test('audio end advances and stops after the last section', async () => {
  const { player, audio, states } = setup(async () => blob());
  player.load(['First.', 'Second.']);
  await player.play(); audio.dispatchEvent(new Event('ended'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(player.index, 1); assert.equal(player.state, 'playing');
  audio.dispatchEvent(new Event('ended')); assert.equal(states.at(-1), 'finished');
  assert.equal(player.state, 'idle');
});
test('provider errors stop playback and are reported once', async () => {
  const { player, errors } = setup(async () => { throw new Error('quota'); });
  await player.play(); assert.equal(player.state, 'idle'); assert.equal(errors.length, 1);
});
test('native callbacks cannot advance after a stop', async () => {
  let event;
  const { player, tts } = setup();
  tts.speak = (_text, options) => { event = options.onEvent; };
  player.configure({ provider: 'browser', voice: { native: { voiceName: 'Test' } }, rate: 1, volume: 1 });
  await player.play(); event({ type: 'start' }); player.stop(); event({ type: 'end' });
  assert.equal(player.index, 0); assert.equal(player.state, 'idle');
});
