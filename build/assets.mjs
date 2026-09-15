#!/usr/bin/env node
// Copies static site assets (favicon, OG image) into dist/ and generates
// robots.txt, sitemap.xml and llms.txt for the published pages.
//
// Usage:
//   node build/assets.mjs
//   node build/assets.mjs --site-url https://example.com

import { copyFile, writeFile, mkdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tolerateClosedPipe } from './stdio.mjs';

tolerateClosedPipe();

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULT_SITE_URL = 'https://emojisaurus.me';

export function buildRobotsTxt(siteUrl) {
  return `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`;
}

export function buildSitemapXml(siteUrl, lastmod) {
  const pages = ['/', '/about'];
  const urls = pages
    .map((p) => `  <url>\n    <loc>${siteUrl}${p}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/**
 * llms.txt (https://llmstxt.org): a machine-oriented index pointing an LLM at
 * the markdown twin of the About page rather than the 2.5+ MB app bundle,
 * which is not useful content for a model to fetch.
 */
/**
 * dist/404.html — a branded not-found page. Cloudflare Pages serves this
 * (with a real 404 status) for any path that matches no static file and no
 * Function, instead of its silent default: falling back to index.html with
 * a 200, which would otherwise let every mistyped URL "soft-404" as the
 * full app.
 *
 * Deliberately static (no dataset substitution) so it can never fail to
 * build and never drifts — this page's only job is "you're lost, here are
 * the two real pages on this site."
 */
export function buildNotFoundHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>🦖 404 - Emojisaurus.me</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/favicon.ico" sizes="any">
<meta name="theme-color" content="#0b0d10">
<meta name="color-scheme" content="dark">
<style>
:root{
  --bg:#0b0d10; --panel2:#151a21; --line:#20262f;
  --ink:#e6ebf2; --dim:#8b95a4;
  --accent:#5eead4; --accent2:#38bdf8;
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace;
  --ui:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  --emoji:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Segoe UI Symbol",sans-serif;
}
*{box-sizing:border-box}
body{
  margin:0;min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:22px;text-align:center;padding:28px;background:var(--bg);color:var(--ink);
  font:16px/1.6 var(--ui);-webkit-font-smoothing:antialiased;
}
.glyph{font-family:var(--emoji);font-size:64px;line-height:1}
h1{font:600 clamp(24px,5vw,34px)/1.2 var(--ui);letter-spacing:-.02em;margin:0}
code{
  font:.9em/1.4 var(--mono);background:var(--panel2);border:1px solid var(--line);
  border-radius:4px;padding:2px 7px;color:var(--accent2);
}
p{margin:0;color:var(--dim);max-width:46ch}
.links{display:flex;gap:14px;flex-wrap:wrap;justify-content:center}
a.cta{
  font:13px/1 var(--mono);text-decoration:none;color:#0b0d10;background:var(--accent);
  padding:12px 18px;border-radius:6px;white-space:nowrap;
}
a.cta:hover{background:#8ff3e2}
a.ghost{
  font:13px/1 var(--mono);text-decoration:none;color:var(--ink);background:transparent;
  border:1px solid var(--line);padding:12px 18px;border-radius:6px;white-space:nowrap;
}
a.ghost:hover{border-color:var(--accent2);color:var(--accent2)}
</style>
</head>
<body>
<div class="glyph">🔎🦖❓</div>
<h1>404 — no emoji lives at this address</h1>
<p>There's no page at that path. Try searching for a meaning instead, or read what Emojisaurus actually is.</p>
<div class="links">
  <a class="cta" href="/">Search Emojisaurus →</a>
  <a class="ghost" href="/about">About</a>
</div>
</body>
</html>
`;
}

export function buildLlmsTxt(siteUrl, dataset) {
  const { meta } = dataset;
  const fq = meta.totals.byStatus['fully-qualified'].toLocaleString('en-GB');
  const senses = String(meta.altUsageSenses);
  const registers = String(Object.keys(meta.altRegisters).length);
  const version = meta.emojiVersion;
  return `# Emojisaurus

> A thesaurus for emoji: search from a meaning back to the emoji that carries it, not just look up what an emoji is officially called.

Emoji ${version} · ${fq} fully-qualified characters · ${senses} curated senses across ${registers} registers · zero network calls, works fully offline.

## Docs

- [About Emojisaurus](${siteUrl}/about.md): what a thesaurus is, why official CLDR names are hard to search by, where the dictionary data comes from, and what the curated layer is not.
- [Emoji explorer](${siteUrl}/): the interactive, self-contained search app. Supports name:, kw:, alt:, reg:, bytes:, v:, cp:, kind:, status: and tones: query syntax, and pasting an emoji directly to search by it.

## Optional

- [About (HTML)](${siteUrl}/about)
- [Sitemap](${siteUrl}/sitemap.xml)
`;
}

export async function buildAssets({ siteUrl = DEFAULT_SITE_URL } = {}) {
  await mkdir(join(ROOT, 'dist'), { recursive: true });

  await Promise.all([
    copyFile(join(ROOT, 'src', 'favicon.ico'), join(ROOT, 'dist', 'favicon.ico')),
    copyFile(join(ROOT, 'src', 'og_default.jpg'), join(ROOT, 'dist', 'og_default.jpg')),
  ]);

  const dataset = JSON.parse(await readFile(join(ROOT, 'data', 'dataset.json'), 'utf8'));
  const lastmod = new Date(dataset.meta.generatedAt).toISOString().slice(0, 10);

  await Promise.all([
    writeFile(join(ROOT, 'dist', 'robots.txt'), buildRobotsTxt(siteUrl)),
    writeFile(join(ROOT, 'dist', 'sitemap.xml'), buildSitemapXml(siteUrl, lastmod)),
    writeFile(join(ROOT, 'dist', 'llms.txt'), buildLlmsTxt(siteUrl, dataset)),
    writeFile(join(ROOT, 'dist', '404.html'), buildNotFoundHtml()),
  ]);

  return { siteUrl, lastmod };
}

async function main() {
  const i = process.argv.indexOf('--site-url');
  const siteUrl = i !== -1 ? process.argv[i + 1] : DEFAULT_SITE_URL;
  const { lastmod } = await buildAssets({ siteUrl });
  process.stdout.write(
    `dist/favicon.ico, dist/og_default.jpg, dist/robots.txt, dist/sitemap.xml, dist/llms.txt, dist/404.html  -> ${siteUrl} (lastmod ${lastmod})\n`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`assets build failed: ${err.stack}\n`);
    process.exit(1);
  });
}
