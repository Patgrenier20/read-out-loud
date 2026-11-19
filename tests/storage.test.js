import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeDocument } from '../src/storage.js';

test('saving progress replaces the existing read and preserves its bookmark', () => {
  const old = { id: 'a', index: 0, text: 'Reading', bookmarks: [] };
  const current = { ...old, index: 2, bookmarks: [2] };
  const merged = mergeDocument(current, [old, { id: 'b', text: 'Other read' }]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, 'a');
  assert.equal(merged[0].index, 2);
  assert.deepEqual(merged[0].bookmarks, [2]);
  assert.ok(merged[0].updatedAt);
});

test('the shelf evicts old multibyte reads before exceeding local storage budget', () => {
  const library = Array.from({ length: 8 }, (_, id) => ({ id: String(id), text: '漢'.repeat(600_000) }));
  const result = mergeDocument({ id: 'new', text: '漢'.repeat(600_000), index: 0, bookmarks: [] }, library);
  assert.ok(result.length < 8);
  assert.equal(result[0].id, 'new');
  assert.ok(new TextEncoder().encode(JSON.stringify(result)).length <= 7_000_000);
});
