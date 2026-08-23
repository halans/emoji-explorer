# Building

No dependencies to install. Node 18 or newer, and that is the whole toolchain.

```bash
node --version    # v24.14.1 on the machine these examples were captured from
```

## The pipeline

Four stages, each a standalone script you can run on its own.

```
build/fetch.mjs    upstream files      -> data/raw/ + manifest.json
build/dataset.mjs  data/raw/           -> data/dataset.json
build/bundle.mjs   dataset + src/      -> dist/emoji17.html
test/              everything          -> pass/fail
```

`npm run verify` runs all four in order.

Every entry point calls `tolerateClosedPipe()` from `build/stdio.mjs` first, so
piping any of them into `head` or `less` ends quietly instead of raising an
unhandled EPIPE. `test/cli.test.mjs` spawns each one and destroys its stdout to
prove it.

### 1. `build/fetch.mjs`

Downloads 26 files into `data/raw/` and writes `data/raw/manifest.json` with a
SHA-256 for each. Already-present files are reused, so re-running is cheap;
`--force` re-downloads.

```
$ node build/fetch.mjs
Current Emoji 17.0 sources:
  fetched emoji-test.txt (669326 bytes)
  fetched emoji-sequences.txt (194868 bytes)
  fetched emoji-zwj-sequences.txt (277215 bytes)
  fetched emoji-data.txt (107324 bytes)
  fetched emoji-variation-sequences.txt (38315 bytes)
  fetched cldr-annotations.xml (296588 bytes)
  fetched cldr-annotations-derived.xml (550115 bytes)

Pre-4.0 snapshots (no emoji-test.txt existed yet):
  fetched emoji-data-1.0.txt (82628 bytes)
  ...

Historical emoji-test.txt files (for version-added derivation):
  fetched emoji-test-4.0.txt (287574 bytes)
  ...
  fetched emoji-test-17.0.txt (669326 bytes)

Wrote manifest for 26 files -> data/raw/manifest.json
```

All URLs live in `build/sources.mjs`. **Emoji 17.0 is not under
`/Public/emoji/17.0/`** — that path 404s, because the historical
`/Public/emoji/<version>/` tree stops at 16.0. The 17.0 files are at
`/Public/17.0.0/emoji/`, with two companions under `/Public/17.0.0/ucd/emoji/`.
Most third-party tooling still points at the old location.

The historical snapshots are not used to derive versions (see stage 2) — they
back an independent cross-validation test.

### 2. `build/dataset.mjs`

Parses and joins everything into one record per row, and writes
`data/dataset.json`.

```
$ node build/dataset.mjs
Emoji 17.0 dataset -> data/dataset.json
  rows: 5225
    fully-qualified: 3944
    unqualified: 243
    minimally-qualified: 1029
    component: 9
  emoji with curated alternate senses: 570
  curated senses total: 823
  by register:
    internet      92 emoji   95 senses  (2 files)
    misread       84 emoji   84 senses  (2 files)
    sexual        78 emoji   78 senses  (3 files)  [explicit, hidden by default]
    irony         72 emoji   75 senses  (2 files)
    workplace     62 emoji   62 senses  (2 files)
    subculture    46 emoji   48 senses
    nonenglish    45 emoji   47 senses
    everyday      44 emoji   44 senses
    sports        38 emoji   38 senses
    religion      36 emoji   36 senses
    dating        36 emoji   36 senses
    regional      33 emoji   35 senses
    politics      35 emoji   35 senses
    kink          32 emoji   32 senses  [explicit, hidden by default]
    finance       31 emoji   31 senses
    substances    25 emoji   25 senses  [explicit, hidden by default]
    platform      22 emoji   22 senses
```

Parsers live in `build/parse.mjs` as pure functions with no I/O, so
`test/parse.test.mjs` exercises them against inline fixtures rather than against
the 669 KB real file.

Two ideas matter here:

- **`id` vs `key`.** `id` is the exact code point sequence and is the primary
  key. `key` is the same sequence with `U+FE0F` stripped and is deliberately
  *not* unique — the fully-qualified and minimally-qualified spellings of one
  emoji share it, which is how CLDR annotations and curated senses attach to
  both at once. A test asserts both properties, because collapsing them was a
  real bug during development.
- **Nothing is computed twice.** `utf8Bytes` comes from `Buffer.byteLength`,
  `utf8Hex` from the actual encoded bytes. No formula, no lookup table.

If the build reports `UNRESOLVED alt keys`, a glyph in `data/alt-usages/` does
not correspond to any emoji and is being silently dropped. Fix the JSON; the
test suite also fails on this.

### 3. `build/bundle.mjs`

Inlines the dataset, the search engine and the UI into `dist/emoji17.html`.

```
$ node build/bundle.mjs
dist/emoji17.html  2.57 MB  (5225 records inlined)
```

Three things worth knowing:

- **The engine is embedded verbatim.** `src/search.mjs` is inlined with only its
  `export` keywords stripped. `test/bundle.test.mjs` asserts the embedded text
  equals `stripExports(src/search.mjs)` character for character, so a stale or
  hand-edited `dist/` fails the build rather than shipping silently.
- **The payload is slimmed and rehydrated.** `utf8Hex`, `key`, `cldrName` and
  `sequenceProperty` are dropped, and empty arrays / null / false are omitted.
  A small hydrator restores them in the browser — `utf8Hex` from `TextEncoder`.
  This took the file from 3.8 MB to 2.54 MB. A test compares every field of
  every hydrated record against `dataset.json` so the slimming cannot lose
  anything.
- **No network references.** A test asserts there is no external script, no
  stylesheet link, no `@import` and no runtime `fetch`.
- **Inlining uses a replacer function, not a replacement string.** The engine
  contains `$&` inside a regex-escape call, and `String.replace` would expand
  that into the matched placeholder text, silently corrupting the bundle. This
  happened; the verbatim-embedding test caught it, and there is now a dedicated
  regression guard.

### 4. Tests

```
$ node --test 'test/*.test.mjs'
ℹ tests 89
ℹ pass 89
ℹ fail 0
ℹ duration_ms 5340.118427
```

| File | Covers |
|---|---|
| `test/parse.test.mjs` | every upstream format, against fixtures |
| `test/dataset.test.mjs` | integrity: counts vs upstream, independent recomputation of byte sizes, key uniqueness, tone-family bijection, curated-key resolution, version cross-validation against the historical snapshots |
| `test/search.test.mjs` | tokeniser, numeric predicates, edit distance, ranking, the explicit gate (including three exhaustive sweeps), a per-keystroke latency guard |
| `test/bundle.test.mjs` | the source-transform functions, verbatim embedding, hydration fidelity, and a **cross-surface equivalence sweep** |
| `test/cli.test.mjs` | CLI output, `--json` validity, the gate, and that every entry point survives a closed stdout (`\| head`) |

The equivalence sweep is the one that keeps the project honest. It boots the
page's own inlined data and engine inside a `node:vm` context, then runs 29
queries × 2 explicit states × 2 tone states through both that context and the
Node engine, asserting the result ids, scores and matched-field lists are
identical. If the browser and the CLI ever disagree, this fails.

## Extending

### Add a searchable field

1. Add the value to the record in `build/dataset.mjs`.
2. Add it to `TEXT_FIELDS` or `NUMERIC_FIELDS` in `src/search.mjs`, plus any
   alias in `FIELD_ALIASES`.
3. For a text field, add a `case` in `matchTerm`'s scoped-field switch.
4. Add it to the index shape in `buildIndex` (lowercased once, at index time).
5. If the page should show it, add a column in `src/shell.html` and a cell in
   `buildRow` in `src/app.mjs`.
6. Add the field to the comparison list in `test/bundle.test.mjs` so equivalence
   keeps covering it.

The field chips in the header are generated from `TEXT_FIELDS` and
`NUMERIC_FIELDS`, so a new field appears in the UI reference automatically.

### Change the ranking

All scores are constants in the `SCORE` object in `src/search.mjs`. The tiers
that matter: exact name > name prefix > whole word > word prefix > alternate
sense > keyword > gloss, with mid-word substring matches scored far below
everything (25 and 20) so that searching `red` does not rank "lowe**red** flag"
above 🚩. `test/search.test.mjs` pins that specific behaviour.

The same word-boundary discipline applies to alternate senses, via a cached
regex per term (`hasWholeWord`): `alt:lying` must find 🧢 and must *not* match a
gloss containing "imp**lying**". The scoped `alt:` field deliberately has **no**
mid-word fallback at all — a scoped query is a precise intent, so a fragment
buried in unrelated prose is noise rather than recall. Free text still falls
back, ranked last.

### Add a UI column

Columns are a CSS grid defined once in `src/shell.html`
(`.thead, .row { grid-template-columns: ... }`) — update that single declaration
and add the matching `<div>` to both the `.thead` markup and `buildRow`. Sorting
comes from the `data-sort` attribute plus an entry in the `SORTS` map in
`src/app.mjs`.

### Performance notes

The table is virtualised: `ROW_H` is fixed at 44px, a spacer div carries the
full scroll height, and only the visible window plus 8 rows of overscan is in
the DOM (32–33 nodes in practice). `buildIndex` lowercases every haystack once
at startup so the per-keystroke path allocates nothing. A full-set query is
about 1–3 ms on the 3,944-row default view, and the test suite fails if four
incremental queries take more than 1500 ms.
