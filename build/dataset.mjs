#!/usr/bin/env node
// Joins every upstream source into one canonical record per emoji and writes
// data/dataset.json. Every derived number is computed here, at build time, from
// the real encoded bytes -- never from a formula or a hand-typed constant.
//
// Usage:  node build/dataset.mjs

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseEmojiTest,
  parseSequenceProperties,
  parseCldrAnnotations,
  classifySequence,
  toneModifiers,
  stripTones,
  normKey,
  fromCodePoints,
  TONE_NAMES,
} from './parse.mjs';
import { EMOJI_VERSION } from './sources.mjs';
import { tolerateClosedPipe } from './stdio.mjs';

tolerateClosedPipe();

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data', 'raw');

const read = (p) => readFile(join(RAW, p), 'utf8');

function hexList(cps) {
  return cps.map((cp) => 'U+' + cp.toString(16).toUpperCase().padStart(4, '0'));
}

/**
 * Loads every file in data/alt-usages/ and merges them.
 *
 * Senses from different thematic files accumulate on the same emoji -- a snake
 * is a betrayer AND a programming language. But a duplicate key *within* one
 * file is an authoring mistake that JSON.parse would silently swallow, keeping
 * only the last, so we detect it from the raw text and throw.
 */
export async function loadAltUsages() {
  const dir = join(ROOT, 'data', 'alt-usages');
  const files = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith('.json')).sort();

  const merged = new Map(); // glyph -> sense[]
  const registers = {};

  for (const file of files) {
    const raw = await readFile(join(dir, file), 'utf8');
    const parsed = JSON.parse(raw);
    const entries = parsed.entries ?? {};

    // Duplicate-key detection against the raw source text.
    const seen = new Set();
    const keyRe = /^\s{4}"((?:[^"\\]|\\.)*)":\s*\[/gm;
    let km;
    while ((km = keyRe.exec(raw)) !== null) {
      const k = JSON.parse(`"${km[1]}"`);
      if (seen.has(k)) {
        throw new Error(`duplicate key "${k}" in data/alt-usages/${file} -- senses would be silently dropped`);
      }
      seen.add(k);
    }

    // A register may be spread over several files (a base file plus later
    // deepening passes), so metadata accumulates rather than overwrites.
    if (!registers[parsed.register]) {
      registers[parsed.register] = {
        files: [],
        explicit: Boolean(parsed.explicit),
        provenance: parsed.provenance ?? null,
        emojiCount: 0,
        senseCount: 0,
      };
    }
    const reg = registers[parsed.register];
    reg.files.push(file);
    reg.explicit = reg.explicit || Boolean(parsed.explicit);
    reg.emojiCount += Object.keys(entries).length;
    reg.senseCount += Object.values(entries).reduce((n, s) => n + s.length, 0);

    for (const [glyph, senses] of Object.entries(entries)) {
      const tagged = senses.map((s) => ({
        ...s,
        register: parsed.register,
        explicit: s.explicit ?? Boolean(parsed.explicit),
      }));
      if (!merged.has(glyph)) merged.set(glyph, []);
      merged.get(glyph).push(...tagged);
    }
  }

  return { entries: Object.fromEntries(merged), registers, files };
}

/**
 * Greedily split a string of concatenated emoji into known records, longest
 * match first so ZWJ sequences are not torn apart. Returns null if any part of
 * the string cannot be accounted for.
 */
function splitIntoKnownEmoji(glyph, byKey) {
  const cps = [...glyph].map((c) => c.codePointAt(0));
  const parts = [];
  let i = 0;
  while (i < cps.length) {
    let matched = null;
    for (let end = cps.length; end > i; end--) {
      const rec = byKey.get(normKey(cps.slice(i, end)));
      if (rec) { matched = { rec, end }; break; }
    }
    if (!matched) return null;
    parts.push(matched.rec);
    i = matched.end;
  }
  return parts.length > 1 ? parts : null;
}

export async function buildDataset() {
  const [testTxt, seqTxt, zwjTxt, annXml, annDerivedXml, alt] = await Promise.all([
    read('emoji-test.txt'),
    read('emoji-sequences.txt'),
    read('emoji-zwj-sequences.txt'),
    read('cldr-annotations.xml'),
    read('cldr-annotations-derived.xml'),
    loadAltUsages(),
  ]);

  const rows = parseEmojiTest(testTxt);
  const seqProps = parseSequenceProperties(seqTxt);
  const zwjProps = parseSequenceProperties(zwjTxt);
  const ann = parseCldrAnnotations(annXml);
  const annDerived = parseCldrAnnotations(annDerivedXml);

  // ---- build one record per emoji-test row -------------------------------
  const records = [];
  const byKey = new Map();

  for (const row of rows) {
    const glyph = fromCodePoints(row.codePoints);
    const utf8Bytes = Buffer.byteLength(glyph, 'utf8');
    const utf16Units = glyph.length;

    const tones = toneModifiers(row.codePoints);
    const parentCps = stripTones(row.codePoints);
    // A bare skin-tone modifier (the component rows 🏻-🏿) is *entirely* tone,
    // so stripping tones leaves nothing. It has no tone-neutral parent.
    const parentKey = parentCps.length ? normKey(parentCps) : null;

    const cldr = annDerived.get(row.key) ?? ann.get(row.key) ?? { keywords: [], tts: null };
    const baseCldr = ann.get(row.key);
    const keywords = [...new Set([...(cldr.keywords ?? []), ...((baseCldr && baseCldr.keywords) || [])])];

    const rec = {
      // `id` is the primary key: the exact code point sequence, so the
      // fully-qualified and minimally-qualified forms of the same emoji stay
      // distinct rows. `key` is the FE0F-stripped join key, deliberately shared
      // between those forms so CLDR and curated data attach to both.
      id: row.codePoints.map((cp) => cp.toString(16).toUpperCase().padStart(4, '0')).join('-'),
      key: row.key,
      emoji: glyph,
      name: row.name,
      cldrName: cldr.tts ?? null,
      group: row.group,
      subgroup: row.subgroup,
      status: row.status,
      version: row.declaredVersion,
      codePoints: hexList(row.codePoints),
      cpCount: row.codePoints.length,
      utf8Bytes,
      utf16Units,
      utf8Hex: [...Buffer.from(glyph, 'utf8')].map((b) => b.toString(16).toUpperCase().padStart(2, '0')),
      kind: classifySequence(row.codePoints),
      sequenceProperty: seqProps.get(row.key) ?? zwjProps.get(row.key) ?? null,
      hasVS16: row.codePoints.includes(0xfe0f),
      toneCount: tones.length,
      tones: tones.map((t) => TONE_NAMES[t]),
      parentKey: tones.length ? parentKey : null,
      isToneComponent: tones.length > 0 && parentKey === null,
      parentId: null,
      keywords,
      altUsages: [],
      toneVariants: [],
      order: row.order,
    };
    records.push(rec);
    if (!byKey.has(rec.key)) byKey.set(rec.key, rec);
  }

  // ---- attach tone-variant families --------------------------------------
  // Families link fully-qualified rows only, by id, so the relationship is a
  // clean bijection: every child names exactly one parent and every parent
  // lists exactly its own children.
  const fqByKey = new Map();
  for (const rec of records) {
    if (rec.status === 'fully-qualified' && !fqByKey.has(rec.key)) fqByKey.set(rec.key, rec);
  }

  for (const rec of records) {
    if (!rec.parentKey || rec.status !== 'fully-qualified') continue;
    const parent = fqByKey.get(rec.parentKey);
    if (!parent) continue;
    rec.parentId = parent.id;
    parent.toneVariants.push(rec.id);
  }

  // ---- attach curated alternate usages -----------------------------------
  // Keys in alt-usages.json are the emoji glyphs themselves for readability;
  // resolve each to a normalised key so VS16 differences don't matter.
  const altByKey = new Map();
  for (const [glyph, senses] of Object.entries(alt.entries)) {
    const key = normKey([...glyph].map((c) => c.codePointAt(0)));
    if (altByKey.has(key)) {
      // Two different glyph spellings (e.g. with and without VS16) normalising
      // to the same emoji -- merge rather than clobber.
      altByKey.get(key).senses.push(...senses);
    } else {
      altByKey.set(key, { glyph, senses: [...senses] });
    }
  }

  let altAttached = 0;
  let comboAttached = 0;
  const unresolvedAlt = [];
  for (const [key, { glyph, senses }] of altByKey) {
    const rec = byKey.get(key);
    if (rec) {
      rec.altUsages.push(...senses);
      altAttached++;
      continue;
    }

    // Some senses only exist for a *pair* of emoji (👉👈, 🌈🐻). Split the
    // glyph into its constituent emoji and attach the sense to each, flagged
    // with the combo it belongs to, so searching either half surfaces it.
    const parts = splitIntoKnownEmoji(glyph, byKey);
    if (!parts) { unresolvedAlt.push({ key, glyph }); continue; }
    for (const part of parts) {
      part.altUsages.push(...senses.map((s) => ({ ...s, combo: glyph })));
    }
    comboAttached++;
  }
  // Tone variants inherit their parent's alternate senses -- the slang meaning
  // of a thumbs-up does not change with skin tone.
  for (const rec of records) {
    if (rec.parentKey && rec.altUsages.length === 0) {
      const parent = fqByKey.get(rec.parentKey) ?? byKey.get(rec.parentKey);
      if (parent && parent.altUsages.length) rec.altUsages = [...parent.altUsages];
    }
  }

  const counts = {};
  for (const rec of records) counts[rec.status] = (counts[rec.status] ?? 0) + 1;

  return {
    meta: {
      emojiVersion: EMOJI_VERSION,
      generatedAt: new Date().toISOString(),
      totals: { rows: records.length, byStatus: counts },
      altUsageEmoji: altAttached,
      altUsageCombos: comboAttached,
      altUsageSenses: Object.values(alt.entries).reduce((n, s) => n + s.length, 0),
      altRegisters: alt.registers,
      altFiles: alt.files,
      unresolvedAlt,
      sources: JSON.parse(await read('manifest.json')).files,
    },
    records,
  };
}

async function main() {
  const dataset = await buildDataset();
  const out = join(ROOT, 'data', 'dataset.json');
  await writeFile(out, JSON.stringify(dataset) + '\n');

  const m = dataset.meta;
  process.stdout.write(`Emoji ${m.emojiVersion} dataset -> data/dataset.json\n`);
  process.stdout.write(`  rows: ${m.totals.rows}\n`);
  for (const [status, n] of Object.entries(m.totals.byStatus)) {
    process.stdout.write(`    ${status}: ${n}\n`);
  }
  process.stdout.write(`  emoji with curated alternate senses: ${m.altUsageEmoji}\n`);
  process.stdout.write(`  curated senses total: ${m.altUsageSenses}\n`);
  process.stdout.write('  by register:\n');
  const regs = Object.entries(m.altRegisters).sort((a, b) => b[1].senseCount - a[1].senseCount);
  for (const [name, r] of regs) {
    process.stdout.write(
      `    ${name.padEnd(12)} ${String(r.emojiCount).padStart(3)} emoji  ${String(r.senseCount).padStart(3)} senses` +
      `${r.files.length > 1 ? `  (${r.files.length} files)` : ''}` +
      `${r.explicit ? '  [explicit, hidden by default]' : ''}\n`,
    );
  }
  if (m.unresolvedAlt.length) {
    process.stdout.write(`  UNRESOLVED alt keys (${m.unresolvedAlt.length}):\n`);
    for (const u of m.unresolvedAlt) process.stdout.write(`    ${u.glyph}  ${u.key}\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`dataset build failed: ${err.stack}\n`);
    process.exit(1);
  });
}
