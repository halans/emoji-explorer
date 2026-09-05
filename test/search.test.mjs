import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  tokenize,
  parseQuery,
  parseNumericPredicate,
  withinEditDistance,
  buildIndex,
  search,
  visibleSenses,
} from '../src/search.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataset = JSON.parse(await readFile(join(ROOT, 'data', 'dataset.json'), 'utf8'));
const index = buildIndex(dataset.records);

const run = (q, o) => search(index, q, o);
const glyphs = (q, o) => run(q, o).results.map((r) => r.rec.emoji);
const names = (q, o) => run(q, o).results.map((r) => r.rec.name);

// ---------------------------------------------------------------------------
// Tokeniser
// ---------------------------------------------------------------------------

test('tokenize splits plain terms', () => {
  assert.deepEqual(tokenize('red flag').map((t) => t.value), ['red', 'flag']);
});

test('tokenize keeps quoted phrases whole', () => {
  const t = tokenize('"red flag" fox');
  assert.equal(t[0].value, 'red flag');
  assert.equal(t[0].phrase, true);
  assert.equal(t[1].value, 'fox');
});

test('tokenize recognises field scopes and their aliases', () => {
  assert.deepEqual(tokenize('name:fox'), [{ field: 'name', value: 'fox', negated: false, phrase: false }]);
  assert.equal(tokenize('keywords:ocean')[0].field, 'kw');
  assert.equal(tokenize('slang:lying')[0].field, 'alt');
  assert.equal(tokenize('size:>4')[0].field, 'bytes');
});

test('an unknown prefix is treated as literal text, not a field', () => {
  const t = tokenize('nonsense:thing');
  assert.equal(t[0].field, null);
  assert.equal(t[0].value, 'nonsense:thing');
});

test('tokenize handles negation and OR', () => {
  const t = tokenize('-flag fire OR water');
  assert.equal(t[0].negated, true);
  assert.equal(t[0].value, 'flag');
  assert.equal(t[2].operator, 'OR');
});

test('a quoted field value stays intact', () => {
  const t = tokenize('alt:"warning sign"');
  assert.equal(t[0].field, 'alt');
  assert.equal(t[0].value, 'warning sign');
});

test('parseQuery groups terms into OR clauses', () => {
  const clauses = parseQuery('a b OR c');
  assert.equal(clauses.length, 2);
  assert.equal(clauses[0].length, 2);
  assert.equal(clauses[1].length, 1);
});

// ---------------------------------------------------------------------------
// Numeric predicates
// ---------------------------------------------------------------------------

test('parseNumericPredicate handles every comparison form', () => {
  assert.equal(parseNumericPredicate('4')(4), true);
  assert.equal(parseNumericPredicate('=4')(5), false);
  assert.equal(parseNumericPredicate('>8')(9), true);
  assert.equal(parseNumericPredicate('>8')(8), false);
  assert.equal(parseNumericPredicate('>=8')(8), true);
  assert.equal(parseNumericPredicate('<4')(3), true);
  assert.equal(parseNumericPredicate('<=4')(4), true);
  const range = parseNumericPredicate('4..7');
  assert.equal(range(4), true);
  assert.equal(range(7), true);
  assert.equal(range(8), false);
  assert.equal(parseNumericPredicate('banana'), null);
});

test('withinEditDistance is bounded correctly', () => {
  assert.equal(withinEditDistance('croissant', 'croissant', 1), true);
  assert.equal(withinEditDistance('croissant', 'croissnt', 1), true);
  assert.equal(withinEditDistance('croissant', 'crossnt', 1), false);
  assert.equal(withinEditDistance('fox', 'box', 1), true);
  assert.equal(withinEditDistance('fox', 'cat', 1), false);
});

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

test('an exact name match ranks first', () => {
  assert.equal(names('croissant')[0], 'croissant');
  assert.equal(names('orca')[0], 'orca');
});

test('a pasted emoji finds its own record', () => {
  const r = run('🧑‍🚀');
  assert.equal(r.total, 1);
  assert.equal(r.results[0].rec.name, 'astronaut');
  assert.equal(r.results[0].fields[0], 'emoji');
});

test('a pasted multi-code-point emoji with skin tone is found', () => {
  const r = run('👍🏽', { collapseTones: false });
  assert.equal(r.results[0].rec.emoji, '👍🏽');
  assert.equal(r.results[0].rec.toneCount, 1);
});

test('a bare hex code point resolves', () => {
  assert.equal(run('1F600').results[0].rec.name, 'grinning face');
  assert.equal(run('U+1F600').results[0].rec.name, 'grinning face');
  assert.equal(run('cp:1F600').results[0].rec.name, 'grinning face');
});

test('CLDR keywords are searchable even when absent from the name', () => {
  // "sasquatch" is a keyword of the Emoji 17.0 "hairy creature", not its name.
  const found = run('sasquatch');
  assert.ok(found.total >= 1);
  assert.equal(found.results[0].rec.name, 'hairy creature');
  assert.ok(!found.results[0].rec.name.includes('sasquatch'));
});

test('curated alternate senses are searchable', () => {
  assert.equal(run('alt:lying').results[0].rec.emoji, '🧢');
  assert.equal(run('alt:betrayer').results[0].rec.emoji, '🐍');
  assert.ok(glyphs('alt:GOAT').includes('🐐'));
});

test('alt: matches whole words, not fragments inside other words', () => {
  // "lying" must not match a gloss containing "implying".
  assert.equal(run('alt:lying').results[0].rec.emoji, '🧢');
  const hits = glyphs('alt:lying');
  assert.ok(!hits.includes('🤧'), 'matched "implying" as if it were "lying"');
});

test('a sense label outranks a gloss mentioning the same word', () => {
  // 🚩's sense label is "warning sign in a person"; other emoji only mention
  // flags in prose. The label holder must come first.
  assert.equal(run('alt:"warning sign"').results[0].rec.emoji, '🚩');
});

test('every register is reachable through reg:', () => {
  const registers = Object.keys(dataset.meta.altRegisters);
  assert.ok(registers.length >= 16, `expected at least 16 registers, got ${registers.length}`);
  for (const r of registers) {
    const explicit = dataset.meta.altRegisters[r].explicit;
    const found = run(`reg:${r}`, { showExplicit: explicit });
    assert.ok(found.total > 0, `register "${r}" returned nothing`);
  }
});

test('the newer registers carry their expected anchors', () => {
  assert.ok(glyphs('reg:sports').includes('🚨'), 'transfer-news siren missing from sports');
  assert.ok(glyphs('reg:politics').includes('🍉'), 'watermelon missing from politics');
  assert.ok(glyphs('reg:religion').includes('🤲'), 'dua hands missing from religion');
  assert.ok(glyphs('reg:dating').includes('🟢'), 'green flag missing from dating');
  assert.ok(glyphs('reg:nonenglish').includes('🫰'), 'finger heart missing from nonenglish');
  assert.ok(glyphs('reg:everyday').includes('📦'), 'parcel missing from everyday');
});

test('one emoji can carry senses from many registers', () => {
  const snake = dataset.records.find((r) => r.emoji === '🙏');
  const registers = new Set(snake.altUsages.map((a) => a.register));
  assert.ok(registers.size >= 4, `🙏 should span several registers, got ${[...registers].join(', ')}`);
});

test('a word-boundary match outranks a mid-word substring', () => {
  // "red" appears inside "lowered" for the mailbox emoji; the red flag must win.
  assert.equal(glyphs('red flag')[0], '🚩');
});

test('numeric filters select by real encoded size', () => {
  const r = run('bytes:>25');
  assert.ok(r.total > 0);
  for (const { rec } of r.results) assert.ok(rec.utf8Bytes > 25);
});

test('a numeric range is inclusive at both ends', () => {
  const r = run('bytes:4..7');
  for (const { rec } of r.results) assert.ok(rec.utf8Bytes >= 4 && rec.utf8Bytes <= 7);
  assert.ok(r.results.some((x) => x.rec.utf8Bytes === 4));
  assert.ok(r.results.some((x) => x.rec.utf8Bytes === 7));
});

test('code point count is filterable independently of byte size', () => {
  const r = run('cps:1');
  for (const { rec } of r.results) assert.equal(rec.cpCount, 1);
});

test('terms are ANDed together', () => {
  const r = run('cps:1 bytes:3');
  for (const { rec } of r.results) {
    assert.equal(rec.cpCount, 1);
    assert.equal(rec.utf8Bytes, 3);
  }
  assert.ok(r.total > 0 && r.total < run('cps:1').total);
});

test('OR widens the result set', () => {
  const keycaps = run('kind:keycap').total;
  const tags = run('kind:tag-flag').total;
  assert.equal(run('kind:keycap OR kind:tag-flag').total, keycaps + tags);
});

test('negation removes matches', () => {
  const all = run('group:food').total;
  const without = run('group:food -name:cheese').total;
  assert.ok(without < all);
  assert.ok(!names('group:food -name:cheese').some((n) => n.includes('cheese')));
});

test('fuzzy fallback catches a typo and is flagged', () => {
  const r = run('croissnt');
  assert.equal(r.usedFuzzy, true);
  assert.equal(r.results[0].rec.name, 'croissant');
});

test('fuzzy matching does not fire for short terms', () => {
  // "cta" must not fuzzily become "cat"; three letters is too short to guess.
  const r = run('cta');
  assert.equal(r.usedFuzzy, false);
});

test('an unmatchable query returns nothing rather than everything', () => {
  assert.equal(run('zzzzqqqqxxxx').total, 0);
});

test('an empty query returns the full default view', () => {
  const r = run('');
  assert.ok(r.total > 1000);
  for (const { rec } of r.results) {
    assert.equal(rec.status, 'fully-qualified');
    assert.equal(rec.parentKey, null, 'tone variants should be collapsed by default');
  }
});

test('collapseTones:false exposes the tone variants', () => {
  const collapsed = run('name:"thumbs up"', { collapseTones: true }).total;
  const flat = run('name:"thumbs up"', { collapseTones: false }).total;
  assert.equal(flat, collapsed + 5, 'expected five skin tones per tone-capable emoji');
});

test('status defaults to fully-qualified and is overridable by the query', () => {
  assert.equal(run('kind:keycap').results.every((r) => r.rec.status === 'fully-qualified'), true);
  const comps = run('status:component');
  assert.ok(comps.total > 0);
  assert.ok(comps.results.every((r) => r.rec.status === 'component'));
});

test('results are ordered by score then by CLDR order', () => {
  const r = run('cat');
  for (let i = 1; i < r.results.length; i++) {
    const a = r.results[i - 1];
    const b = r.results[i];
    assert.ok(a.score > b.score || (a.score === b.score && a.rec.order <= b.rec.order));
  }
});

// ---------------------------------------------------------------------------
// The explicit gate
// ---------------------------------------------------------------------------

test('explicit senses are hidden from display by default', () => {
  const peach = dataset.records.find((r) => r.emoji === '🍑');
  assert.ok(peach.altUsages.some((a) => a.explicit));
  const shown = visibleSenses(peach, false);
  assert.ok(!shown.some((a) => a.explicit));
  assert.equal(visibleSenses(peach, true).length, peach.altUsages.length);
});

test('a query matching only an explicit sense finds nothing while the gate is closed', () => {
  const closed = run('alt:buttocks', { showExplicit: false });
  assert.equal(closed.total, 0, 'explicit senses must not leak through search');
  const open = run('alt:buttocks', { showExplicit: true });
  assert.equal(open.results[0].rec.emoji, '🍑');
});

test('an emoji with both explicit and clean senses stays findable via the clean one', () => {
  // The peach has an explicit sense AND a platform-quirk sense.
  const r = run('alt:"shape drift"', { showExplicit: false });
  assert.equal(r.results[0].rec.emoji, '🍑');
});

test('the gate does not affect non-sense matches', () => {
  assert.equal(run('name:peach', { showExplicit: false }).results[0].rec.emoji, '🍑');
});

test('the substances register is gated too', () => {
  assert.equal(run('reg:substances', { showExplicit: false }).total, 0);
  assert.ok(run('reg:substances', { showExplicit: true }).total > 0);
});

test('exhaustive: no gated sense is ever displayed while the gate is closed', () => {
  // The strict invariant, with no exemptions: whatever a query returns, none of
  // the senses shown for it may be gated.
  const leaks = [];
  for (const rec of dataset.records) {
    for (const a of rec.altUsages.filter((x) => x.explicit)) {
      for (const hit of search(index, `alt:"${a.sense}"`, { showExplicit: false }).results) {
        for (const shown of visibleSenses(hit.rec, false)) {
          if (shown.explicit) leaks.push(`${hit.rec.emoji}: ${shown.register}/${shown.sense}`);
        }
      }
    }
  }
  assert.deepEqual(leaks, [], 'a gated sense was displayed with the gate closed');
});

test('exhaustive: a gated sense cannot be reached by its own wording', () => {
  // Stricter reachability check, with one computed exemption. Some gated labels
  // are ordinary words that legitimately appear in the SAME emoji's ungated
  // text: 🐻's politics gloss says "wolf"-adjacent things, 🦦's subculture
  // gloss literally contains "otter". Those emoji are reachable by that word
  // through their clean senses, which is correct behaviour — the gated sense
  // itself stays hidden (asserted above).
  //
  // So: for every gated label that does NOT appear in the emoji's own ungated
  // wording, the emoji must be unreachable by it. The exemption is derived from
  // the data, never hardcoded, so it cannot be used to paper over a real leak.
  const whole = (haystack, needle) =>
    new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`)
      .test(haystack);

  const leaks = [];
  let exempted = 0;

  for (const rec of dataset.records) {
    const cleanText = rec.altUsages
      .filter((a) => !a.explicit)
      .map((a) => `${a.sense} ${a.gloss ?? ''} ${(a.keywords ?? []).join(' ')}`.toLowerCase())
      .join(' ');

    for (const a of rec.altUsages.filter((x) => x.explicit)) {
      const term = a.sense.toLowerCase();
      const reachable = search(index, `alt:"${a.sense}"`, { showExplicit: false })
        .results.some((r) => r.rec.emoji === rec.emoji);
      if (!reachable) continue;
      if (whole(cleanText, term)) { exempted++; continue; }
      leaks.push(`${rec.emoji} / ${a.register}: ${a.sense}`);
    }
  }

  assert.deepEqual(leaks, [], 'gated senses reachable by their own wording with the gate closed');
  // Keep the exemption honest: if it ever covers a large share, the labels have
  // drifted into ordinary vocabulary and the check has lost its teeth.
  const totalGated = dataset.records.reduce((n, r) => n + r.altUsages.filter((a) => a.explicit).length, 0);
  assert.ok(exempted <= totalGated * 0.1,
    `${exempted} of ${totalGated} gated senses needed the word-collision exemption; too many to trust`);
});

test('exhaustive: every explicit sense IS reachable once the gate is open', () => {
  const missing = [];
  for (const rec of dataset.records) {
    if (rec.parentKey) continue; // tone variants are collapsed by default
    for (const a of rec.altUsages.filter((x) => x.explicit)) {
      const hit = search(index, `alt:"${a.sense}"`, { showExplicit: true })
        .results.some((r) => r.rec.emoji === rec.emoji);
      if (!hit) missing.push(`${rec.emoji}: ${a.sense}`);
    }
  }
  assert.deepEqual(missing, [], 'opening the gate failed to surface some senses');
});

// ---------------------------------------------------------------------------
// Performance guard
// ---------------------------------------------------------------------------

test('a full-set query completes fast enough to run per keystroke', () => {
  const t0 = performance.now();
  for (const q of ['a', 'fl', 'fla', 'flag']) run(q);
  const elapsed = performance.now() - t0;
  assert.ok(elapsed < 1500, `four incremental queries took ${elapsed.toFixed(0)}ms`);
});
