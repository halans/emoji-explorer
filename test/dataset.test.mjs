import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEmojiTest, normKey, toCodePoints } from '../build/parse.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataset = JSON.parse(await readFile(join(ROOT, 'data', 'dataset.json'), 'utf8'));
const records = dataset.records;
const byId = new Map(records.map((r) => [r.id, r]));
// Separate map on the FE0F-stripped join key, for checks that mirror how the
// build attaches CLDR and curated data.
const byNormKey = new Map();
for (const r of records) if (!byNormKey.has(r.key)) byNormKey.set(r.key, r);

test('row count and per-status counts match emoji-test.txt exactly', async () => {
  const upstream = parseEmojiTest(await readFile(join(ROOT, 'data', 'raw', 'emoji-test.txt'), 'utf8'));
  assert.equal(records.length, upstream.length, 'row count drifted from upstream');

  const tally = (rows) => rows.reduce((acc, r) => ((acc[r.status] = (acc[r.status] ?? 0) + 1), acc), {});
  assert.deepEqual(tally(records), tally(upstream));

  // The headline number the UI advertises.
  assert.equal(tally(records)['fully-qualified'], 3944);
});

test('every emoji round-trips through its own code points', () => {
  for (const rec of records) {
    const cps = rec.codePoints.map((c) => parseInt(c.replace('U+', ''), 16));
    assert.equal(String.fromCodePoint(...cps), rec.emoji, `round-trip failed for ${rec.name}`);
  }
});

test('utf8Bytes and utf16Units are recomputed independently and agree', () => {
  for (const rec of records) {
    assert.equal(rec.utf8Bytes, Buffer.byteLength(rec.emoji, 'utf8'), `utf8 byte size wrong for ${rec.name}`);
    assert.equal(rec.utf16Units, rec.emoji.length, `utf16 unit count wrong for ${rec.name}`);
    assert.equal(rec.utf8Hex.length, rec.utf8Bytes, `utf8Hex length disagrees for ${rec.name}`);
    assert.equal(
      Buffer.from(rec.utf8Hex.map((h) => parseInt(h, 16))).toString('utf8'),
      rec.emoji,
      `utf8Hex does not decode back for ${rec.name}`,
    );
  }
});

test('cpCount equals the code point list length', () => {
  for (const rec of records) assert.equal(rec.cpCount, rec.codePoints.length);
});

test('byte size is consistent with code point count bounds', () => {
  // UTF-8 encodes any code point in 1-4 bytes, so total bytes must sit within
  // [cpCount, cpCount*4]. Catches any accidental double-counting.
  for (const rec of records) {
    assert.ok(rec.utf8Bytes >= rec.cpCount, `${rec.name}: ${rec.utf8Bytes}B < ${rec.cpCount}cp`);
    assert.ok(rec.utf8Bytes <= rec.cpCount * 4, `${rec.name}: ${rec.utf8Bytes}B > ${rec.cpCount * 4}`);
  }
});

test('every record carries a version, group and subgroup', () => {
  for (const rec of records) {
    assert.ok(rec.version, `missing version: ${rec.name}`);
    assert.ok(rec.group, `missing group: ${rec.name}`);
    assert.ok(rec.subgroup, `missing subgroup: ${rec.name}`);
  }
});

test('every fully-qualified emoji has at least one CLDR keyword', () => {
  const missing = records.filter((r) => r.status === 'fully-qualified' && r.keywords.length === 0);
  assert.deepEqual(missing.map((r) => r.name), [], 'CLDR join lost some emoji');
});

test('declared version cross-validates against the historical emoji-test.txt files', async () => {
  // Independent check on the E-version field: an emoji declared E13.0 must be
  // absent from the 12.1 snapshot and present in the 13.0 one.
  const hist = join(ROOT, 'data', 'raw', 'historical');
  const snapshots = new Map();
  for (const v of ['12.1', '13.0', '14.0', '15.0', '16.0', '17.0']) {
    const rows = parseEmojiTest(await readFile(join(hist, `emoji-test-${v}.txt`), 'utf8'));
    snapshots.set(v, new Set(rows.map((r) => r.key)));
  }

  const pairs = [['12.1', '13.0'], ['13.1', '14.0'], ['14.0', '15.0'], ['15.1', '16.0'], ['16.0', '17.0']];
  for (const [prev, cur] of pairs) {
    if (!snapshots.has(prev) || !snapshots.has(cur)) continue;
    const declaredNew = records.filter((r) => r.version === cur);
    assert.ok(declaredNew.length > 0, `no emoji declared E${cur}`);
    for (const rec of declaredNew) {
      assert.ok(snapshots.get(cur).has(rec.key), `E${cur} emoji ${rec.emoji} missing from the ${cur} snapshot`);
      assert.ok(!snapshots.get(prev).has(rec.key), `E${cur} emoji ${rec.emoji} already existed in ${prev}`);
    }
  }
});

test('Emoji 17.0 additions are present and are the newest in the set', () => {
  const v17 = records.filter((r) => r.version === '17.0');
  assert.ok(v17.length > 0);
  const versions = [...new Set(records.map((r) => Number(r.version)))];
  assert.equal(Math.max(...versions), 17, 'something newer than 17.0 leaked in');
  // Spot-check two documented 17.0 additions.
  assert.ok(records.some((r) => r.version === '17.0' && r.name === 'fight cloud'));
  assert.ok(records.some((r) => r.version === '17.0' && r.name === 'distorted face'));
});

test('id is a genuine primary key', () => {
  assert.equal(byId.size, records.length, 'record ids are not unique');
  // key is deliberately NOT unique: the fully-qualified and minimally-qualified
  // spellings of one emoji share it so joins reach both.
  const keys = new Set(records.map((r) => r.key));
  assert.ok(keys.size < records.length, 'key unexpectedly became unique; the join model changed');
});

test('tone families are bidirectionally consistent', () => {
  for (const rec of records) {
    for (const childId of rec.toneVariants) {
      const child = byId.get(childId);
      assert.ok(child, `dangling tone variant ${childId} on ${rec.name}`);
      assert.equal(child.parentId, rec.id, `${child.name} does not point back at ${rec.name}`);
      assert.ok(child.toneCount > 0);
      assert.equal(child.status, 'fully-qualified');
    }
    if (rec.parentId) {
      const parent = byId.get(rec.parentId);
      assert.ok(parent, `${rec.name} points at a missing parent`);
      assert.ok(parent.toneVariants.includes(rec.id), `${parent.name} does not list ${rec.name}`);
      assert.equal(parent.toneCount, 0, 'a tone parent should itself be tone-neutral');
    }
  }
});

test('the tone-variant count matches the number of toned rows', () => {
  const linked = records.filter((r) => r.parentId).length;
  const listed = records.reduce((n, r) => n + r.toneVariants.length, 0);
  assert.equal(linked, listed, 'some toned emoji were never linked to a parent');
});

test('every curated alternate-usage key resolves to a real emoji', async () => {
  const dir = join(ROOT, 'data', 'alt-usages');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  assert.ok(files.length > 0, 'no alt-usage files found');

  const attached = new Set();
  for (const rec of records) for (const a of rec.altUsages) attached.add(a.sense);

  for (const file of files) {
    const parsed = JSON.parse(await readFile(join(dir, file), 'utf8'));
    for (const [glyph, senses] of Object.entries(parsed.entries)) {
      const key = normKey(toCodePoints(glyph));
      const direct = byNormKey.get(key);
      if (!direct) {
        // Must be a resolvable multi-emoji combo instead.
        const attachedAsCombo = records.some((r) => r.altUsages.some((a) => a.combo === glyph));
        assert.ok(attachedAsCombo, `${file}: "${glyph}" resolves to neither an emoji nor a combo`);
      }
      for (const s of senses) {
        assert.ok(s.sense, `${file}: ${glyph} has a sense with no label`);
        assert.ok(s.gloss, `${file}: ${glyph} sense "${s.sense}" has no gloss`);
        assert.ok(['high', 'medium', 'low'].includes(s.confidence), `${file}: ${glyph} bad confidence`);
        assert.ok(attached.has(s.sense), `${file}: sense "${s.sense}" never reached the dataset`);
      }
    }
  }
});

test('no alt-usage file contains a duplicate emoji key', async () => {
  // JSON.parse would silently keep only the last, losing senses.
  const dir = join(ROOT, 'data', 'alt-usages');
  for (const file of (await readdir(dir)).filter((f) => f.endsWith('.json'))) {
    const raw = await readFile(join(dir, file), 'utf8');
    const seen = new Set();
    const re = /^\s{4}"((?:[^"\\]|\\.)*)":\s*\[/gm;
    let m;
    while ((m = re.exec(raw)) !== null) {
      const k = JSON.parse(`"${m[1]}"`);
      assert.ok(!seen.has(k), `${file}: duplicate key ${k}`);
      seen.add(k);
    }
    assert.ok(seen.size > 0, `${file}: parsed no keys, the detector regex may be wrong`);
  }
});

test('every alternate sense is tagged with a register and explicit flag', () => {
  for (const rec of records) {
    for (const a of rec.altUsages) {
      assert.ok(a.register, `${rec.emoji} sense "${a.sense}" has no register`);
      assert.equal(typeof a.explicit, 'boolean', `${rec.emoji} sense "${a.sense}" has no explicit flag`);
    }
  }
});

test('explicit registers are actually flagged explicit', () => {
  // Derived from the dataset's own register metadata rather than hardcoded, so
  // a newly added gated register is covered automatically. A hardcoded list
  // would silently stop protecting anything it did not name.
  const explicitRegisters = new Set(
    Object.entries(dataset.meta.altRegisters)
      .filter(([, r]) => r.explicit)
      .map(([name]) => name),
  );
  assert.ok(explicitRegisters.size >= 2, 'expected at least two gated registers');

  for (const rec of records) {
    for (const a of rec.altUsages) {
      if (explicitRegisters.has(a.register)) {
        assert.equal(a.explicit, true, `${rec.emoji}: ${a.register}/${a.sense} is not flagged explicit`);
      }
    }
  }
});

test('per-sense explicit overrides only ever tighten, never loosen', () => {
  // The schema supports a per-sense `explicit` flag that overrides its file's
  // default. That is deliberate and useful: a single sensitive sense inside an
  // otherwise-clean register (🧠 in `internet`) can be gated on its own. What
  // must never happen is the reverse — a sense inside a gated register opting
  // *out* — because the UI and docs present that whole register as gated.
  const gated = new Set(
    Object.entries(dataset.meta.altRegisters)
      .filter(([, r]) => r.explicit)
      .map(([name]) => name),
  );

  let tightened = 0;
  for (const rec of records) {
    for (const a of rec.altUsages) {
      if (gated.has(a.register)) {
        assert.equal(a.explicit, true, `${rec.emoji}: ${a.register}/"${a.sense}" opted out of a gated register`);
      } else if (a.explicit) {
        tightened++;
      }
    }
  }
  // Confirms the override mechanism is actually exercised, so this test is not
  // silently passing over a feature nobody uses.
  assert.ok(tightened > 0, 'no per-sense tightening found; the override may have stopped working');
});

test('tone variants inherit their parent alternate senses', () => {
  const thumbsUp = records.find((r) => r.emoji === '👍');
  assert.ok(thumbsUp.altUsages.length > 0);
  const toned = byId.get(thumbsUp.toneVariants[0]);
  assert.deepEqual(
    toned.altUsages.map((a) => a.sense),
    thumbsUp.altUsages.map((a) => a.sense),
  );
});

test('the build reported no unresolved alternate-usage keys', () => {
  assert.deepEqual(dataset.meta.unresolvedAlt, []);
});

test('dataset metadata reports the version actually present in the data', () => {
  assert.equal(dataset.meta.emojiVersion, '17.0');
  assert.equal(dataset.meta.totals.rows, records.length);
});
