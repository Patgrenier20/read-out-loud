import test from 'node:test';
import assert from 'node:assert/strict';
import { splitText, normalizeText, escapeXml, validateEndpoint } from '../src/text.js';

test('normalizes line endings without removing paragraph breaks', () => {
  assert.equal(normalizeText('  Hello\tworld.\r\n\r\n\r\n Next. '), 'Hello world.\n\nNext.');
});
test('splits multilingual text within the provider byte limit without losing content', () => {
  const input = `Hello there. Next sentence! ${'漢字🙂'.repeat(1300)} end.`;
  const chunks = splitText(input);
  assert.ok(chunks.length > 5);
  assert.ok(chunks.every(chunk => new TextEncoder().encode(chunk).length <= 1800));
  assert.equal(chunks.join('').replace(/\s/g, ''), input.replace(/\s/g, ''));
  assert.ok(chunks.every(chunk => !chunk.includes('\ufffd')));
});
test('rejects oversized text and handles empty input', () => {
  assert.deepEqual(splitText(' \n '), []);
  assert.throws(() => splitText('x'.repeat(600_001)), /too long/);
});
test('escapes text and voice identifiers for SSML', () => {
  assert.equal(escapeXml('<voice name="a&b">\'hello\'</voice>'), '&lt;voice name=&quot;a&amp;b&quot;&gt;&apos;hello&apos;&lt;/voice&gt;');
});
test('allows HTTPS and loopback servers but rejects cleartext remote servers and URL credentials', () => {
  assert.equal(validateEndpoint('http://localhost:8880/v1/'), 'http://localhost:8880/v1');
  assert.equal(validateEndpoint('https://tts.example.com/v1'), 'https://tts.example.com/v1');
  for (const url of ['http://evil.example/v1', 'https://user:secret@example.com', 'javascript:alert(1)', 'https://example.com?key=secret']) {
    assert.throws(() => validateEndpoint(url));
  }
});
