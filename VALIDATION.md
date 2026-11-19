# Validation notes — November 19, 2026

## Automated checks

- `npm run check`: unit tests and production bundling pass.
- `npm audit`: zero reported vulnerabilities at validation time.
- Unit tests cover byte-safe multilingual splitting, server URL validation, SSML escaping, authentication/request shapes, ElevenLabs pagination, error redaction, cancellation races, navigation, pause/resume without another synthesis request, and shelf deduplication/size limits.

## Browser checks

Loaded the packaged extension into an isolated Playwright Chromium profile. No user browser profile or provider credentials were used.

- Chrome discovered Windows voices David, Mark, and Zira after initial engine startup. Native playback returned `chrome.tts.isSpeaking() === true` and Stop was exercised. Audible quality was not manually assessed.
- Imported synthetic TXT, EPUB, DOCX, and PDF fixtures through the real file input and checked extracted content. EPUB heading/paragraph boundaries were verified.
- Connected to a local HTTP fixture server with two voice IDs; exercised audio play, pause, resume, and stop using a valid WAV test tone. This verifies the adapter/audio pipeline, not a model's synthesis quality.
- Saved a bookmark and advanced reading position, then reloaded inside the ordinary save debounce interval. Both survived via the immediate pagehide storage flush.
- Injected the actual bundled article extractor into a local fixture article and verified that article content was returned and navigation excluded.
- Exercised pending-selection session-storage handoff to an already-open reader.
- Captured light and dark reader screenshots under `output/playwright/`.

The local-provider integration profile uses a **test-only copy** of the build with localhost host permission granted in its manifest, so headless automation can exercise the adapter without a native Chrome permission prompt. The delivered `dist/manifest.json` retains optional host permissions only. Native optional-permission prompts, toolbar/panel chrome, and the right-click menu itself still need manual verification in normal Chrome.

## Unverified

Live ElevenLabs, Azure, and Google synthesis require the user's credentials and were not called. Their REST request shapes and error handling were covered with mocked responses. No actual Kokoro installation/model was started. Large real-world, encrypted, scanned, corrupt, and complex-layout documents have not been exhaustively tested. No Chrome Web Store submission was made.
