import test from 'node:test';
import assert from 'node:assert/strict';
import { prefersMarkdown } from '../functions/about.js';

test('an explicit text/markdown Accept header prefers markdown', () => {
  assert.equal(prefersMarkdown('text/markdown'), true);
});

test('a browser-shaped Accept header (text/html first, wildcard tail) prefers HTML', () => {
  assert.equal(
    prefersMarkdown('text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'),
    false
  );
});

test('markdown listed ahead of html wins', () => {
  assert.equal(prefersMarkdown('text/markdown, text/html;q=0.9'), true);
});

test('markdown listed behind html loses', () => {
  assert.equal(prefersMarkdown('text/html, text/markdown;q=0.5'), false);
});

test('equal q-values tie-break to markdown, since it was explicitly requested', () => {
  assert.equal(prefersMarkdown('text/markdown;q=0.5, text/html;q=0.5'), true);
});

test('a bare wildcard Accept (no explicit markdown token) stays on HTML', () => {
  assert.equal(prefersMarkdown('*/*'), false);
});

test('a missing Accept header stays on HTML', () => {
  assert.equal(prefersMarkdown(null), false);
  assert.equal(prefersMarkdown(''), false);
});

test('text/markdown outranks an unrelated wildcard fallback for html', () => {
  // No explicit text/html token: html's q comes from the wildcard.
  assert.equal(prefersMarkdown('text/markdown;q=0.7, */*;q=0.6'), true);
});
