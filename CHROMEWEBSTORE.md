# Chrome Web Store preparation

Status: local development build 0.1.0. Not submitted or published. This is a review draft; no store approval is implied.

## Listing

- **Name:** Read Out Loud
- **Summary:** Your web, in your voice. Read pages and documents with free system voices or your own TTS providers.
- **Category:** Accessibility / productivity (choose the appropriate available category during submission).
- **Single purpose:** Read user-selected web and document text aloud, with controls for voice, speed, progress, and bookmarks.
- **Pricing:** No extension subscription or usage fee. Third-party API usage and hosted/local server operation can have separate costs.

### Description draft

Listen to articles, selected text, and your own documents in a calm side-panel reader. Start with your browser and system voices, or connect your own ElevenLabs, Azure Speech, Google Cloud Text-to-Speech, or compatible local TTS server.

Open a page, import a PDF, EPUB, DOCX or text file, or paste something to read. Choose a voice, set the speed, and follow the highlighted sections. Keep bookmarks and your reading position in a small local shelf. Includes light and dark themes and no extension account requirement.

The extension is free to use. Cloud speech services require your own account/key and may charge for usage. Available voices depend on your device and provider account. Scanned PDFs require OCR elsewhere; DRM-protected books are unsupported. The side panel must remain open during playback.

## Required permission justifications

| Permission | Reason |
| --- | --- |
| `activeTab` | Temporary access to extract the current website's readable text after an explicit user action. |
| `scripting` | Inject the locally bundled article extractor when the user chooses Read this page. |
| `storage` | Store preferences, provider credentials, recent reading text, bookmarks, reading positions, and a brief pending selection handoff. |
| `sidePanel` | Display reading text and playback controls beside the user's current page. |
| `contextMenus` | Offer Read selection out loud for highlighted page text. |
| `tts` | Discover and play the voices registered with Chrome and the operating system. |

## Optional host permission justifications

The manifest declares `https://*/*`, `http://localhost/*`, and `http://127.0.0.1/*` as **optional** host patterns. Broad HTTPS eligibility is necessary to support user-configured TTS servers. At connection time the extension requests only the chosen provider's origin, not every origin. Loopback origins support user-hosted TTS. Host permissions include all ports of a host under Chrome's matching rules.

Fixed endpoints: `api.elevenlabs.io`, `texttospeech.googleapis.com`, and the Azure Speech regional host matching the resource region. No required blanket browsing host permission is requested.

## Code and data disclosures

- No remotely hosted executable code. Speech responses are audio/JSON data. All libraries and the PDF worker are packaged locally.
- `wasm-unsafe-eval` permits locally bundled PDF.js WebAssembly helpers. It does not permit arbitrary JavaScript eval or remote scripts.
- No extension backend, telemetry, advertising, sale of user data, or cloud account sync.
- Local data includes website/document content, source URLs, bookmarks, reading progress, settings, and sensitive provider credentials.
- Text and authentication information are transmitted directly to the chosen provider for the reading purpose. Browser network voices may also transmit text through their speech engine.
- The publisher must accurately disclose website content and authentication information handling in the dashboard, plus any applicable activity-related categories after reviewing current dashboard definitions. Do not claim that cloud-mode text stays entirely on-device.
- `PRIVACY.md` is a policy draft requiring a publisher contact and public URL.

## Before submission

- Supply publisher identity, support contact, homepage if desired, and hosted privacy-policy URL.
- Review actual behavior against the current Chrome Web Store policies and complete the privacy questionnaire accurately.
- Validate live synthesis with your own credentials for each advertised provider; check account/model restrictions.
- Manually verify normal Chrome installed voices, native side-panel opening, context menus, and active-tab behavior across page navigation.
- Capture current store-required promotional assets and screenshots from the finished build.
- Package the contents of `dist/` at ZIP root. Never include a Chrome profile, API keys, `.env` files, `node_modules`, or development browser state.
- Include bundled dependency licenses. Review third-party notices before distribution.
