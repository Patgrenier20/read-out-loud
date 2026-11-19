export const MAX_TEXT = 600_000;

export function normalizeText(text) {
  return String(text).replace(/\r\n?/g, '\n').replace(/[\t\u00a0 ]+/g, ' ')
    .replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Short utterances avoid Chrome's long-speech stalls and fit byte-limited APIs.
// Unicode code points stay intact, including emoji and supplementary characters.
export function splitText(text, maxBytes = 1800) {
  const clean = normalizeText(text);
  if (!clean) return [];
  if (clean.length > MAX_TEXT) throw new Error('This document is too long. Open a section under 600,000 characters.');
  const encoder = new TextEncoder();
  const segments = [...new Intl.Segmenter(undefined, { granularity: 'sentence' }).segment(clean)].map(x => x.segment);
  const chunks = [];
  let current = '';
  for (const sentence of segments) {
    for (const token of sentence.match(/\S+\s*|\s+/gu) || []) {
      if (encoder.encode(current + token).length <= maxBytes) { current += token; continue; }
      if (current.trim()) chunks.push(current.trim());
      current = '';
      // Handle long URLs, unspaced CJK, and strings with no word boundaries.
      for (const char of token) {
        if (encoder.encode(current + char).length > maxBytes) {
          if (current.trim()) chunks.push(current.trim());
          current = '';
        }
        current += char;
      }
    }
    // Prefer sentence boundaries to make skipping and highlighting useful.
    if (current.trim()) chunks.push(current.trim());
    current = '';
  }
  return chunks;
}

export function escapeXml(value) {
  return String(value).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
}

export function validateEndpoint(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Enter a valid server URL.'); }
  const loopback = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('Use HTTPS, or HTTP on localhost / 127.0.0.1.');
  }
  if (url.username || url.password || url.search || url.hash) throw new Error('Server URLs cannot contain credentials, a query, or a fragment.');
  return url.href.replace(/\/$/, '');
}
