#!/usr/bin/env node
// Query the dataset from the terminal using the exact same engine the webpage
// runs. This is not a convenience wrapper -- it is the second surface that the
// equivalence test diffs against the browser build.
//
// Usage:
//   node src/cli.mjs "red flag"
//   node src/cli.mjs 'bytes:>25 group:people'
//   node src/cli.mjs --json 'alt:lying'
//   node src/cli.mjs --explicit 'reg:sexual'
//   node src/cli.mjs --status all 'kind:keycap'

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex, search, visibleSenses } from './search.mjs';
import { tolerateClosedPipe } from '../build/stdio.mjs';

tolerateClosedPipe();

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export async function loadRecords() {
  const raw = await readFile(join(ROOT, 'data', 'dataset.json'), 'utf8');
  return JSON.parse(raw);
}

function parseArgs(argv) {
  const opts = { json: false, explicit: false, status: 'fully-qualified', limit: 20, flat: false };
  const terms = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--explicit') opts.explicit = true;
    else if (a === '--flat') opts.flat = true;
    else if (a === '--status') opts.status = argv[++i];
    else if (a === '--limit') opts.limit = Number(argv[++i]);
    else terms.push(a);
  }
  return { opts, query: terms.join(' ') };
}

async function main() {
  const { opts, query } = parseArgs(process.argv.slice(2));
  const dataset = await loadRecords();
  const index = buildIndex(dataset.records);

  const statuses = opts.status === 'all' ? [] : opts.status.split(',');
  const { results, total, usedFuzzy } = search(index, query, {
    statuses,
    showExplicit: opts.explicit,
    collapseTones: !opts.flat,
    limit: opts.limit,
  });

  if (opts.json) {
    process.stdout.write(JSON.stringify({ query, total, results: results.map((r) => ({
      emoji: r.rec.emoji, name: r.rec.name, score: r.score, fields: r.fields,
      utf8Bytes: r.rec.utf8Bytes, cpCount: r.rec.cpCount, version: r.rec.version,
    })) }, null, 2) + '\n');
    return;
  }

  process.stdout.write(`query: ${query || '(all)'}\n`);
  process.stdout.write(`${total} match${total === 1 ? '' : 'es'}${usedFuzzy ? ' (fuzzy fallback used)' : ''}${total > results.length ? `, showing ${results.length}` : ''}\n\n`);
  process.stdout.write('  em  bytes  cps  ver    name / matched on\n');
  process.stdout.write('  ──  ─────  ───  ─────  ───────────────────────────────────────────\n');
  for (const r of results) {
    const rec = r.rec;
    process.stdout.write(
      `  ${rec.emoji}  ${String(rec.utf8Bytes).padStart(5)}  ${String(rec.cpCount).padStart(3)}  ${('E' + rec.version).padEnd(5)}  ${rec.name}  [${r.fields.join(',')}]\n`,
    );
    const senses = visibleSenses(rec, opts.explicit);
    for (const s of senses.slice(0, 3)) {
      process.stdout.write(`         └ ${s.register}: ${s.sense}\n`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`${err.stack}\n`);
    process.exit(1);
  });
}
