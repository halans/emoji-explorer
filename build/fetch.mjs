#!/usr/bin/env node
// Downloads every upstream source into data/raw/ and records a checksum
// manifest so builds are reproducible and repeatable offline.
//
// Usage:  node build/fetch.mjs [--force]

import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES, HISTORICAL_TEST_FILES, HISTORICAL_COMPOSED } from './sources.mjs';
import { tolerateClosedPipe } from './stdio.mjs';

tolerateClosedPipe();

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data', 'raw');
const HIST = join(RAW, 'historical');
const MANIFEST = join(RAW, 'manifest.json');

const force = process.argv.includes('--force');

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function download(url, dest, label) {
  if (!force && (await exists(dest))) {
    const body = await readFile(dest);
    process.stdout.write(`  cached  ${label} (${body.length} bytes)\n`);
    return body;
  }
  const res = await fetch(url, { headers: { 'user-agent': 'emoji-explorer-build/1.0' } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, body);
  process.stdout.write(`  fetched ${label} (${body.length} bytes)\n`);
  return body;
}

async function main() {
  await mkdir(RAW, { recursive: true });
  await mkdir(HIST, { recursive: true });

  const manifest = { fetchedAt: new Date().toISOString(), files: {} };

  process.stdout.write('Current Emoji 17.0 sources:\n');
  for (const [name, meta] of Object.entries(SOURCES)) {
    const body = await download(meta.url, join(RAW, name), name);
    manifest.files[name] = {
      url: meta.url,
      role: meta.role,
      bytes: body.length,
      sha256: createHash('sha256').update(body).digest('hex'),
    };
  }

  process.stdout.write('\nPre-4.0 snapshots (no emoji-test.txt existed yet):\n');
  for (const { version, files } of HISTORICAL_COMPOSED) {
    for (const [kind, url] of Object.entries(files)) {
      const name = `emoji-${kind}-${version}.txt`;
      const body = await download(url, join(HIST, name), name);
      manifest.files[`historical/${name}`] = {
        url,
        role: `Emoji ${version} ${kind} file, used to reconstruct the pre-4.0 emoji set`,
        bytes: body.length,
        sha256: createHash('sha256').update(body).digest('hex'),
      };
    }
  }

  process.stdout.write('\nHistorical emoji-test.txt files (for version-added derivation):\n');
  for (const { version, url } of HISTORICAL_TEST_FILES) {
    const name = `emoji-test-${version}.txt`;
    const body = await download(url, join(HIST, name), name);
    manifest.files[`historical/${name}`] = {
      url,
      role: `emoji-test.txt for Emoji ${version}`,
      bytes: body.length,
      sha256: createHash('sha256').update(body).digest('hex'),
    };
  }

  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  const count = Object.keys(manifest.files).length;
  process.stdout.write(`\nWrote manifest for ${count} files -> data/raw/manifest.json\n`);
}

main().catch((err) => {
  process.stderr.write(`fetch failed: ${err.message}\n`);
  process.exit(1);
});
