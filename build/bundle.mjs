#!/usr/bin/env node
// Inlines the dataset, the shared search engine and the UI into one
// self-contained HTML file that runs offline with no network and no build step.
//
// The engine is embedded VERBATIM (only the `export` keywords are stripped, and
// the test suite asserts that transform is lossless) so the page and the CLI
// cannot drift apart.
//
// Usage:  node build/bundle.mjs

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tolerateClosedPipe } from './stdio.mjs';

tolerateClosedPipe();

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Strip ESM export keywords so the module body can run inline in a classic scope. */
export function stripExports(source) {
  return source
    .replace(/^export\s+(const|let|var|function|class|async\s+function)\s/gm, '$1 ')
    .replace(/^export\s*\{[^}]*\};?\s*$/gm, '')
    .replace(/^export\s+default\s/gm, 'const __default = ');
}

/** Remove import statements (single- and multi-line). */
export function stripImports(source) {
  return source.replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '');
}

/** JSON embedded in <script> must not terminate the tag or break on line separators. */
export function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export async function bundle() {
  const [shell, engine, app, datasetRaw] = await Promise.all([
    readFile(join(ROOT, 'src', 'shell.html'), 'utf8'),
    readFile(join(ROOT, 'src', 'search.mjs'), 'utf8'),
    readFile(join(ROOT, 'src', 'app.mjs'), 'utf8'),
    readFile(join(ROOT, 'data', 'dataset.json'), 'utf8'),
  ]);

  const dataset = JSON.parse(datasetRaw);

  // Trim the payload to exactly what the page reads. `utf8Hex` is dropped
  // because TextEncoder reproduces it in the browser for free and it is the
  // largest field in the dataset; `key`, `cldrName` and `sequenceProperty` are
  // build-time joins the UI never touches. Empty arrays and null/false values
  // are omitted and restored by the hydrator below.
  const DROP = new Set(['utf8Hex', 'key', 'cldrName', 'sequenceProperty']);
  const slim = dataset.records.map((rec) => {
    const out = {};
    for (const [k, v] of Object.entries(rec)) {
      if (DROP.has(k)) continue;
      if (Array.isArray(v) && v.length === 0) continue;
      if (v === null || v === false) continue;
      out[k] = v;
    }
    return out;
  });

  // The page does not need the full source manifest; keep the meta it displays.
  const payload = {
    meta: {
      emojiVersion: dataset.meta.emojiVersion,
      generatedAt: dataset.meta.generatedAt,
      totals: dataset.meta.totals,
      altUsageEmoji: dataset.meta.altUsageEmoji,
      altUsageSenses: dataset.meta.altUsageSenses,
      altRegisters: dataset.meta.altRegisters,
    },
    records: slim,
  };

  // Restores the fields the slimming step dropped, so app.mjs and search.mjs
  // see records with exactly the same shape they get from dataset.json in Node.
  const hydrate = `
(function(){
  var d = globalThis.__EMOJI_DATA__, enc = new TextEncoder();
  for (var i = 0; i < d.records.length; i++) {
    var r = d.records[i];
    if (!r.keywords) r.keywords = [];
    if (!r.altUsages) r.altUsages = [];
    if (!r.toneVariants) r.toneVariants = [];
    if (!r.tones) r.tones = [];
    if (!r.parentKey) r.parentKey = null;
    if (!r.parentId) r.parentId = null;
    if (!r.hasVS16) r.hasVS16 = false;
    if (r.toneCount == null) r.toneCount = 0;
    var bytes = enc.encode(r.emoji), hex = new Array(bytes.length);
    for (var j = 0; j < bytes.length; j++) {
      hex[j] = bytes[j].toString(16).toUpperCase().padStart(2, '0');
    }
    r.utf8Hex = hex;
  }
})();`;

  const script = [
    '<script>',
    `globalThis.__EMOJI_DATA__ = ${safeJson(payload)};`,
    hydrate,
    '</script>',
    '<script>',
    '/* ---- src/search.mjs (verbatim, exports stripped) ---- */',
    stripExports(engine),
    '/* ---- src/app.mjs (verbatim, imports stripped) ---- */',
    stripImports(app),
    '</script>',
  ].join('\n');

  // Replacer function, NOT a replacement string: the inlined engine contains
  // `$&` (inside a regex-escape call), and String.replace would expand that
  // into the matched placeholder text, silently corrupting the bundle. The
  // verbatim-embedding test caught exactly this.
  const html = shell.replace('<!--APP-->', () => script);

  await mkdir(join(ROOT, 'dist'), { recursive: true });
  const out = join(ROOT, 'dist', 'emoji17.html');
  await writeFile(out, html);
  // Cloudflare Pages (and other static hosts) look for index.html at the
  // output root; the app itself is served as emoji17.html so it still opens
  // directly from disk. This rewrite (200, not a redirect) maps / to it
  // without changing the URL.
  await writeFile(join(ROOT, 'dist', '_redirects'), '/ /emoji17.html 200\n');
  return { out, bytes: Buffer.byteLength(html), records: dataset.records.length };
}

async function main() {
  const { out, bytes, records } = await bundle();
  process.stdout.write(`dist/emoji17.html  ${(bytes / 1024 / 1024).toFixed(2)} MB  (${records} records inlined)\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`bundle failed: ${err.stack}\n`);
    process.exit(1);
  });
}
