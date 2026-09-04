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

export const DEFAULT_ABOUT_URL = 'about';
export const DEFAULT_CANONICAL_URL = 'https://emojisaurus.me/';
export const DEFAULT_OG_IMAGE_URL = 'https://emojisaurus.me/og_default.jpg';

/** Escape a value for insertion into an HTML attribute. */
function escAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/** JSON-LD (WebApplication) describing the app page, for answer engines. */
export function buildAppJsonLd({ canonicalUrl, ogImageUrl }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Emojisaurus',
    alternateName: 'Emoji Explorer',
    url: canonicalUrl,
    description: 'A thesaurus for emoji: search the complete Emoji set by meaning, slang sense, byte size, code point or version, not just by official name.',
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Any (runs in any modern web browser)',
    browserRequirements: 'Requires JavaScript',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    image: ogImageUrl,
  };
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

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

export async function bundle({
  aboutUrl = DEFAULT_ABOUT_URL,
  canonicalUrl = DEFAULT_CANONICAL_URL,
  ogImageUrl = DEFAULT_OG_IMAGE_URL,
} = {}) {
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
  let html = shell.replace('<!--APP-->', () => script);

  // The About link points at the landing page. Relative by default, which is
  // right for the zip and any static host; overridable because artifact hosts
  // publish each file at its own unrelated URL.
  html = html.replace(/\{\{aboutUrl\}\}/g, escAttr(aboutUrl));
  html = html.replace(/\{\{canonicalUrl\}\}/g, escAttr(canonicalUrl));
  html = html.replace(/\{\{ogImageUrl\}\}/g, escAttr(ogImageUrl));
  html = html.replace('<!--JSONLD-->', () => buildAppJsonLd({ canonicalUrl, ogImageUrl }));
  const leftover = html.match(/\{\{\w+\}\}/g);
  if (leftover) throw new Error(`unsubstituted tokens in shell.html: ${leftover.join(', ')}`);

  await mkdir(join(ROOT, 'dist'), { recursive: true });
  const out = join(ROOT, 'dist', 'index.html');
  await writeFile(out, html);
  return { out, bytes: Buffer.byteLength(html), records: dataset.records.length };
}

async function main() {
  const i = process.argv.indexOf('--about-url');
  const aboutUrl = i !== -1 ? process.argv[i + 1] : DEFAULT_ABOUT_URL;
  const ci = process.argv.indexOf('--canonical-url');
  const canonicalUrl = ci !== -1 ? process.argv[ci + 1] : DEFAULT_CANONICAL_URL;
  const oi = process.argv.indexOf('--og-image-url');
  const ogImageUrl = oi !== -1 ? process.argv[oi + 1] : DEFAULT_OG_IMAGE_URL;
  const { out, bytes, records } = await bundle({ aboutUrl, canonicalUrl, ogImageUrl });
  process.stdout.write(`dist/index.html  ${(bytes / 1024 / 1024).toFixed(2)} MB  (${records} records inlined)\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`bundle failed: ${err.stack}\n`);
    process.exit(1);
  });
}
