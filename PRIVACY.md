# Read Out Loud privacy policy

Draft for this local build, dated November 19, 2026. Before public distribution, the publisher must add a contact address and publish this policy at an accessible URL.

Read Out Loud reads text aloud using browser speech engines or a speech provider you explicitly configure. It does not have an extension-operated backend, user accounts, advertising, analytics, or tracking.

## Local information

The extension stores your settings, chosen voice IDs, API keys, recent document text, source URLs, bookmarks, and reading positions in this Chrome profile using `chrome.storage.local`. Your recent reading shelf is bounded and older entries may be removed automatically. Keys are not encrypted by the extension. No extension data is sent through Chrome storage sync.

Selection text passed from the context menu is held briefly in Chrome session storage until the reader consumes it. Local documents are parsed on your computer. HTML from sites and documents is converted to plain text, not rendered as active content.

## Speech services

With browser/system voices, Chrome passes text to your selected speech engine. Some browser voices operate over a network. Their data handling is governed by the engine provider.

When you choose ElevenLabs, Azure Speech, Google Cloud TTS, or a custom server, voice discovery sends the configured authentication information to that service. Playback and previews send the requested text, voice, model, and synthesis settings directly to that provider. The provider can process or retain information under its own terms and privacy policy. Provider usage can incur fees. The extension does not receive the provider's billing information.

Local-server mode sends text to your configured loopback endpoint. A custom HTTPS server receives text at the endpoint you configure. You are responsible for choosing a server you trust.

## Permissions

Page content is extracted when you choose Read this page, using temporary access to the active tab. The extension does not continuously scan your tabs or browsing history. Provider host access is optional and requested when you connect a provider. API keys are restricted to trusted extension contexts and are not made available to page content scripts.

## Removal

Delete individual reads from Your shelf. Remove all saved API keys from Connections. You can revoke optional site permissions in Chrome's extension settings. Uninstalling the extension removes its profile-local extension data. Deleting extension data does not delete information already held by an external speech service; contact that provider for those requests.

## Contact

Publisher contact: **to be supplied before publication**.
