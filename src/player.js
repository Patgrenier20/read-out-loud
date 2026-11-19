import { synthesize } from './providers.js';

// One owner for audio, requests, and navigation. A generation token ensures an
// old callback can never restart playback after Stop, Next, or a provider change.
export class Player {
  constructor({ onState, onIndex, onError, generate = synthesize, audio = new Audio(), tts = chrome.tts }) {
    Object.assign(this, { onState, onIndex, onError, generate, audio, tts });
    this.generation = 0;
    this.state = 'idle';
    this.index = 0;
    this.chunks = [];
    this.audio.addEventListener('ended', () => this.advance());
    this.audio.addEventListener('error', () => this.fail(new Error('Audio could not be decoded. Check the server output format.')));
  }
  setState(state) { this.state = state; this.onState(state); }
  configure(options) { this.options = options; }
  load(chunks, index = 0) {
    this.stop();
    this.chunks = chunks;
    this.index = Math.min(Math.max(index, 0), Math.max(0, chunks.length - 1));
    this.onIndex(this.index);
  }
  release() {
    this.controller?.abort();
    this.controller = null;
    this.audio.pause();
    this.audio.removeAttribute('src');
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
    this.tts.stop();
  }
  stop() { this.generation++; this.release(); this.setState('idle'); }
  fail(error) {
    if (this.state === 'idle') return;
    this.stop();
    this.onError(error);
  }
  async play() {
    if (!this.chunks.length) return;
    if (this.state === 'playing' || this.state === 'loading') return;
    if (this.state === 'paused') {
      this.setState('playing');
      try {
        if (this.options.provider === 'browser') this.tts.resume();
        else await this.audio.play();
      } catch (error) { this.fail(error); }
      return;
    }
    const token = ++this.generation;
    this.release();
    const { provider, config, voice, rate, volume } = this.options;
    this.onIndex(this.index);
    this.setState('loading');
    try {
      if (!voice) throw new Error('Choose a voice first. Connect your provider or refresh the browser voice list.');
      if (provider === 'browser') {
        const options = { voiceName: voice.native.voiceName, rate, volume,
          onEvent: event => {
            if (token !== this.generation) return;
            if (event.type === 'start') this.setState('playing');
            if (event.type === 'end') this.advance();
            if (event.type === 'error') this.fail(new Error(event.errorMessage || 'The system voice could not speak.'));
            if (event.type === 'interrupted' || event.type === 'cancelled') this.stop();
          } };
        if (voice.native.lang) options.lang = voice.native.lang;
        if (voice.native.extensionId) options.extensionId = voice.native.extensionId;
        this.tts.speak(this.chunks[this.index], options, () => {
          if (token === this.generation && chrome.runtime.lastError) this.fail(new Error(chrome.runtime.lastError.message));
        });
      } else {
        this.controller = new AbortController();
        const blob = await this.generate(provider, config, voice, this.chunks[this.index], this.controller.signal);
        if (token !== this.generation) return;
        this.objectUrl = URL.createObjectURL(blob);
        this.audio.src = this.objectUrl;
        this.audio.playbackRate = rate;
        this.audio.volume = volume;
        await this.audio.play();
        if (token === this.generation) this.setState('playing');
      }
    } catch (error) { if (token === this.generation) this.fail(error); }
  }
  pause() {
    if (this.state !== 'playing') return;
    if (this.options.provider === 'browser') this.tts.pause(); else this.audio.pause();
    this.setState('paused');
  }
  seek(index) {
    const resume = ['playing', 'loading', 'paused'].includes(this.state);
    this.stop();
    this.index = Math.min(Math.max(0, index), this.chunks.length - 1);
    this.onIndex(this.index);
    if (resume) void this.play();
  }
  advance() {
    if (!['playing', 'loading'].includes(this.state)) return;
    if (this.index + 1 < this.chunks.length) {
      this.setState('idle');
      this.index++;
      void this.play();
    } else { this.stop(); this.onState('finished'); }
  }
}
