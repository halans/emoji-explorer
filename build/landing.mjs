#!/usr/bin/env node
// Builds dist/index.html — the linkable landing page and About document.
//
// Deliberately NOT the app: it carries no dataset, no engine and no JavaScript,
// so it stays a few tens of kilobytes and loads instantly when someone follows
// a link to it. Every figure in the copy is substituted from data/dataset.json
// at build time, so the prose cannot drift from the data the app ships.
//
// Usage:
//   node build/landing.mjs                       # links to ./index.html
//   node build/landing.mjs --app-url <url>       # links to an absolute URL
//   node build/landing.mjs --canonical-url <url> --og-image-url <url>
//                                                 # override the production defaults below
//
// The relative default is correct for the zip and for any ordinary static host
// where both files sit side by side. The override exists because artifact
// hosts publish each file at its own unrelated URL.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tolerateClosedPipe } from './stdio.mjs';

tolerateClosedPipe();

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULT_APP_URL = 'index.html';
export const DEFAULT_CANONICAL_URL = 'https://emojisaurus.me/about.html';
export const DEFAULT_OG_IMAGE_URL = 'https://emojisaurus.me/og_default.jpg';

/** Escape a value for insertion into HTML text or a double-quoted attribute. */
export function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Register chips, ordered by size, with the gated ones marked. */
export function registerChips(altRegisters) {
  return Object.entries(altRegisters)
    .sort((a, b) => b[1].senseCount - a[1].senseCount)
    .map(([name, r]) =>
      `<span class="${r.explicit ? 'gated' : ''}" title="${esc(r.senseCount)} senses${r.explicit ? ', behind the explicit toggle' : ''}">${esc(name)}</span>`)
    .join('');
}

/**
 * CLDR contributes the whole "dictionary layer": every name, every keyword, and
 * the collation order. Counted from the built dataset rather than typed in, and
 * counted here rather than added to dataset.json so that editing this page
 * never forces the 2.6 MB app bundle to be rebuilt and republished.
 */
export function cldrStats(records) {
  const fq = records.filter((r) => r.status === 'fully-qualified');
  const keywords = fq.reduce((n, r) => n + r.keywords.length, 0);
  return {
    keywordCount: keywords.toLocaleString('en-GB'),
    keywordAvg: (keywords / fq.length).toFixed(1),
  };
}

export function buildValues(dataset, appUrl, canonicalUrl, ogImageUrl) {
  const { meta, records } = dataset;
  const cldr = cldrStats(records);
  return {
    keywordCount: cldr.keywordCount,
    keywordAvg: cldr.keywordAvg,
    version: meta.emojiVersion,
    fq: meta.totals.byStatus['fully-qualified'].toLocaleString('en-GB'),
    rows: meta.totals.rows.toLocaleString('en-GB'),
    senses: String(meta.altUsageSenses),
    emoji: String(meta.altUsageEmoji),
    registers: String(Object.keys(meta.altRegisters).length),
    registerChips: registerChips(meta.altRegisters),
    appUrl: esc(appUrl),
    canonicalUrl: esc(canonicalUrl),
    ogImageUrl: esc(ogImageUrl),
    built: new Date(meta.generatedAt).toISOString().slice(0, 10),
  };
}

/**
 * JSON-LD (WebSite + FAQPage) for the about page. The FAQ entries mirror
 * sections already on the page verbatim, so answer engines can lift them
 * without the copy drifting from what a reader actually sees.
 */
export function buildLandingJsonLd(values) {
  const graph = [
    {
      '@type': 'WebSite',
      name: 'Emojisaurus',
      url: values.canonicalUrl,
      description: 'A thesaurus for emoji: search from a meaning back to the emoji that carries it.',
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'What does Emojisaurus do?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: `A thesaurus for emoji: it searches from a meaning back to the emoji that carries it, not just an emoji's official name. It covers ${values.fq} fully-qualified Emoji ${values.version} characters, plus ${values.senses} curated alternate senses across ${values.registers} registers.`,
          },
        },
        {
          '@type': 'Question',
          name: 'What is the difference between a dictionary and a thesaurus?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'A dictionary goes word to meaning. A thesaurus goes meaning to word. Emojisaurus provides both: the CLDR dictionary layer of official names and keywords, and a hand-curated thesaurus layer of slang, ironic, regional and technical senses.',
          },
        },
        {
          '@type': 'Question',
          name: 'Why are official emoji names hard to search by?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Official CLDR names describe the picture, not the meaning. The skull emoji is officially named "skull" but commonly means laughter; the billed cap emoji is named "billed cap" but commonly means someone is lying.',
          },
        },
        {
          '@type': 'Question',
          name: 'Where does the emoji data come from?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: "Names, keywords and code point data come from the Unicode Consortium's emoji-test.txt and the CLDR annotation files. The curated alternate-sense layer is hand-written and rated by confidence.",
          },
        },
        {
          '@type': 'Question',
          name: 'Does Emojisaurus require an internet connection?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: "No. It's a single self-contained HTML file with zero runtime dependencies, network calls or trackers, and it works fully offline.",
          },
        },
      ],
    },
  ];
  return `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })}</script>`;
}

/** Substitute {{token}} placeholders. Throws on any left unreplaced. */
export function render(template, values) {
  const out = template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in values)) throw new Error(`landing template references unknown token {{${key}}}`);
    return values[key];
  });
  const leftover = out.match(/\{\{\w+\}\}/g);
  if (leftover) throw new Error(`unsubstituted tokens remain: ${leftover.join(', ')}`);
  return out;
}

/** Convert emoji text into URL-encoded query string */
function emojiToQuery(emoji) {
  return encodeURIComponent(emoji);
}

/** Make emoji spans clickable links to the app search */
export function makeEmojisClickable(html, appUrl) {
  return html.replace(/<span class="em">([^<]+)<\/span>/g, (match, emoji) => {
    const query = emojiToQuery(emoji);
    const href = `${appUrl}?q=${query}`;
    // Escape the emoji for HTML attributes
    const safeEmoji = emoji
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    return `<a href="${href}" class="emoji-link" title="Search for ${safeEmoji}">${emoji}</a>`;
  });
}

export async function buildLanding({
  appUrl = DEFAULT_APP_URL,
  canonicalUrl = DEFAULT_CANONICAL_URL,
  ogImageUrl = DEFAULT_OG_IMAGE_URL,
} = {}) {
  const [template, datasetRaw] = await Promise.all([
    readFile(join(ROOT, 'src', 'landing.html'), 'utf8'),
    readFile(join(ROOT, 'data', 'dataset.json'), 'utf8'),
  ]);
  const dataset = JSON.parse(datasetRaw);
  const values = buildValues(dataset, appUrl, canonicalUrl, ogImageUrl);
  let html = render(template, values);
  html = html.replace('<!--JSONLD-->', () => buildLandingJsonLd(values));

  // Make all emoji spans clickable
  html = makeEmojisClickable(html, appUrl);

  await mkdir(join(ROOT, 'dist'), { recursive: true });
  const out = join(ROOT, 'dist', 'about.html');
  await writeFile(out, html);
  return { out, bytes: Buffer.byteLength(html), appUrl };
}

async function main() {
  const i = process.argv.indexOf('--app-url');
  const appUrl = i !== -1 ? process.argv[i + 1] : DEFAULT_APP_URL;
  const ci = process.argv.indexOf('--canonical-url');
  const canonicalUrl = ci !== -1 ? process.argv[ci + 1] : DEFAULT_CANONICAL_URL;
  const oi = process.argv.indexOf('--og-image-url');
  const ogImageUrl = oi !== -1 ? process.argv[oi + 1] : DEFAULT_OG_IMAGE_URL;
  const { bytes } = await buildLanding({ appUrl, canonicalUrl, ogImageUrl });
  process.stdout.write(`dist/about.html   ${(bytes / 1024).toFixed(1)} KB  -> app at ${appUrl}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`landing build failed: ${err.stack}\n`);
    process.exit(1);
  });
}
