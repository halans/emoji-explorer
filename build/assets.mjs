#!/usr/bin/env node
// Copies static site assets (favicon, OG image) into dist/ and generates
// robots.txt + sitemap.xml for the two published pages.
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
  const pages = ['/', '/about.html'];
  const urls = pages
    .map((p) => `  <url>\n    <loc>${siteUrl}${p}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
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
  ]);

  return { siteUrl, lastmod };
}

async function main() {
  const i = process.argv.indexOf('--site-url');
  const siteUrl = i !== -1 ? process.argv[i + 1] : DEFAULT_SITE_URL;
  const { lastmod } = await buildAssets({ siteUrl });
  process.stdout.write(
    `dist/favicon.ico, dist/og_default.jpg, dist/robots.txt, dist/sitemap.xml  -> ${siteUrl} (lastmod ${lastmod})\n`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`assets build failed: ${err.stack}\n`);
    process.exit(1);
  });
}
