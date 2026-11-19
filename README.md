# Read Out Loud

A free Chrome Manifest V3 extension for listening to pages, selected text, and local documents. No account with this extension, subscription, analytics, or extension usage fee. Optional speech services use your own account and may charge for API usage.

## Install locally

The prepared extension is in `dist/`.

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** in the upper-right corner.
3. Click **Load unpacked** and select `J:\chrome extensions\read out loud\dist`.
4. Pin **Read Out Loud** from Chrome's extensions menu.
5. Open a normal website and click the extension icon to open the reader side panel.
6. Click **Read this page**, choose a voice, and press Play.

Selecting text before importing reads only that selection. You can also right-click a selection and choose **Read selection out loud**. That command loads the selection; press Play in the panel to begin. Keep the panel open during playback. Closing it stops audio; opening it again restores your last saved section.

After changing the source, run `npm run build`, then click the extension's Reload button in `chrome://extensions` and reopen the panel.

## Voice connections

| Provider | Setup | Voices | Cost |
| --- | --- | --- | --- |
| Browser & system | None; install additional Windows speech language packs or compatible Chrome speech engines if desired | Every voice returned by Chrome's TTS API | No extension fee; network voices depend on the speech engine |
| ElevenLabs | Connections → API key → Save & load voices | All pages of voices available to your account, including eligible custom voices | Your ElevenLabs credits/billing |
| Azure Speech | Connections → Speech resource key and region, such as `eastus` | The regional voice catalog returned by Azure | Your Azure billing/quota |
| Google Cloud TTS | Enable Cloud Text-to-Speech and billing; add a Google Cloud API key | The voice catalog returned by the v1 API | Your Google Cloud billing/quota |
| Local / custom | Run a compatible TTS server and enter its API base URL | Server-reported voices or comma-separated manual IDs | Local compute, or your server's fees |

The extension does not unlock voices excluded by a provider's account tier or licensing. A catalog voice can still reject synthesis for account, model, quota, or regional reasons. Some specialist voices require a different API or extra options; these are not guaranteed by the generic synthesis adapter.

### ElevenLabs

Use an API key with voice-list and text-to-speech access. Model discovery additionally needs models access. After connecting, the Model ID field offers discovered TTS models; you can also enter an ID manually. The default is `eleven_multilingual_v2`. Stability and similarity are configurable from 0 to 1; model-specific restrictions still apply. Add shared/library voices to your ElevenLabs account before expecting them in the picker. The extension never clones or purchases a voice.

### Azure

Use a **Speech resource** key and its matching region. This adapter uses public-cloud regional endpoints, not sovereign-cloud or custom deployment endpoints. It synthesizes standard single-voice SSML; speaking styles, roles, and multi-voice narration are not currently exposed.

### Google

Use a key from a project with the Text-to-Speech API enabled and the required billing/access. Restrict the key to the Text-to-Speech API. Browser HTTP-referrer restrictions can be incompatible with extension requests. Catalog availability does not guarantee all specialist voices work with the v1 synchronous endpoint.

### Local TTS, including Kokoro-FastAPI

This adapter targets the following HTTP contract:

```text
GET  http://localhost:8880/v1/audio/voices
     → { "voices": ["af_heart", "bf_emma"] }

POST http://localhost:8880/v1/audio/speech
     { "model": "kokoro", "input": "Hello", "voice": "af_heart", "response_format": "mp3" }
     → binary audio with an audio/* content type
```

The default server address is `http://localhost:8880/v1` and model is `kokoro`. You must install and start the server separately; no model or server is included. If your server has no voice listing endpoint, enter comma-separated voice IDs in Connections. An optional key is sent as a Bearer token. HTTPS custom servers are supported; cleartext HTTP is limited to localhost and 127.0.0.1. Chrome requests host permission only when you connect. Chrome host permissions cannot be narrowed to a particular port.

Ollama itself is not a speech synthesis server and cannot directly satisfy this contract. Use a dedicated TTS model/server alongside it.

## Reading features

- Article extraction with Mozilla Readability and a plain-text fallback.
- TXT, Markdown, CSV, HTML, DOCX, text-based PDF, and unencrypted EPUB imports.
- Pasted text, sentence/section highlighting in the reader, optional follow-along scrolling, and jump-to-section controls.
- Play, pause, resume, stop, previous/next section, 0.5×–3× speed, and volume.
- Search voice names, language tags, and available labels.
- Short voice preview. **Cloud previews consume provider usage.**
- Your last eight reads, progress, bookmarks, and light/dark themes stored in this Chrome profile.
- Click a section to move to it; if already playing, playback continues there. Bookmark chips jump to a saved section; Shift-click removes a bookmark.

## Architecture

The interface is plain JavaScript and CSS to keep an extension-sized app simple to build and inspect. It does not need React, a Python backend, an extension account, or a hosted relay server. Esbuild bundles all executable dependencies locally to comply with Manifest V3's remote-code restrictions.

- `src/background.js`: panel setup, selection context menu, credential storage access restriction.
- `src/extract.js`: user-triggered page extraction in Chrome's isolated content-script world.
- `src/providers.js`: authenticated voice discovery and audio generation adapters.
- `src/player.js`: playback state, request cancellation, stale callback protection, and object URL cleanup.
- `src/documents.js`: local format parsing, PDF worker setup, and file/expansion limits.
- `src/storage.js`: settings, profile-local keys, and bounded reading shelf.
- `src/text.js`: normalization, Unicode-safe byte-limited splitting, URL and XML safety.
- `src/sidepanel.js`: interface events and reading state.

Cloud playback generates one section at a time. Pause/resume reuses existing audio. Returning to a previous section, changing speed during playback, or replaying regenerates audio and can consume additional credits. Speed uses local audio playback rate for API voices rather than provider-specific prosody settings. Preloading, durable audio caching, and audio export are not implemented.

## Development and validation

Requires Node.js 24 or a supported recent Node version.

```powershell
npm ci
npm run check
npm audit
```

Tests cover multilingual chunk limits, endpoint validation, SSML escaping, provider request formats, paginated voice discovery, error redaction, pause/resume, navigation, and stop-during-request races. Live provider credentials are not included and are not used in the automated tests.

## Limits and next steps

- Chrome protects internal pages, the Chrome Web Store, and some built-in document viewers from injection. Download PDFs and import them through **Open a file**. Some site interactions require clicking the extension's toolbar icon again to obtain the temporary active-tab grant.
- Canvas-based editors such as Google Docs, cross-origin frames, paywalled content, and virtualized ebook readers may not expose useful text. Copy/paste or local export is the fallback.
- No OCR for scans, DRM decryption, legacy `.doc`, cloud sync, word-level timing, in-page highlighting, or book table of contents yet.
- Maximum input: 20 MB per file, 64 MB expanded archives, 600,000 characters per read. The shelf keeps up to eight reads, evicting older reads earlier if needed to keep its JSON below 7 MB.
- A browser's installed voices vary by OS, profile, network access, and available engines. Headless test browsers may expose none. Network/system voice data handling is controlled by that engine.
- Keys are in `chrome.storage.local`, **not encrypted by the extension**. Treat the Chrome profile as sensitive. Keys are never synced by this extension or passed to content scripts. Remove saved keys in Connections when needed.
- The earliest declared Chrome version is 116 for the extension APIs; current Chrome is recommended, especially for the bundled PDF parser. Old browser versions have not been validated.
- Store publication requires a developer account, review of the supplied listing/privacy drafts, a hosted privacy-policy URL, and screenshots. Nothing is published automatically.

See `PRIVACY.md`, `CHROMEWEBSTORE.md`, and `THIRD_PARTY_NOTICES.md` for distribution notes.
