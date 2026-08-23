# Recreating this project

## From the repository

```bash
node --version            # needs >= 18
node build/fetch.mjs      # ~26 files, network required, once
node build/dataset.mjs
node build/bundle.mjs
node --test 'test/*.test.mjs'
open dist/emoji17.html    # or just double-click it
```

`npm run verify` does all four. Nothing is installed — `dependencies` and
`devDependencies` are both empty, and `npm install` is not a step.

Only `build/fetch.mjs` touches the network. Once `data/raw/` is populated the
rest of the build, the tests and the page all work fully offline.

### The distributed zip is already offline-complete

`emoji17-explorer.zip` ships with `data/raw/` populated (all 26 upstream files
plus their SHA-256 manifest), `data/dataset.json` built, and
`dist/emoji17.html` built. So from an unzipped copy you can go straight to:

```bash
node --test 'test/*.test.mjs'   # 94 tests, no network
open dist/emoji17.html          # works immediately
```

and rebuild everything without touching the network:

```bash
node build/dataset.mjs && node build/bundle.mjs && node --test 'test/*.test.mjs'
```

`node build/fetch.mjs` is only needed to *refresh* the upstream data — it skips
files already present, so it is a no-op unless you pass `--force`. The bundled
`data/raw/manifest.json` records the exact bytes and SHA-256 of every source
file used to produce the shipped dataset, so you can verify provenance without
re-downloading anything.

## From an empty directory

Everything needed to rebuild is in these files:

```
build/sources.mjs      every upstream URL
build/fetch.mjs        download + checksum
build/parse.mjs        parsers for each upstream format
build/dataset.mjs      the join, and every computed field
build/bundle.mjs       inline into one HTML file
src/search.mjs         the query engine   (shared, single source of truth)
src/app.mjs            the UI             (imports the engine)
src/cli.mjs            the terminal surface (imports the same engine)
src/shell.html         markup + CSS
data/alt-usages/*.json the curated layer, 17 registers over 23 files
                       (hand-written, not derivable from any source)
build/stdio.mjs        closed-pipe tolerance for every entry point
test/*.test.mjs        94 tests
```

`data/raw/`, `data/dataset.json` and `dist/emoji17.html` are all generated and
safe to delete — `npm run verify` reproduces them.

The one thing that **cannot** be regenerated from an upstream source is
`data/alt-usages/`. It is original writing. Back it up; everything else is a
build artefact.

## Verifying a rebuild produced the right thing

The build prints its own headline numbers, and they should match:

```
rows: 5225
  fully-qualified: 3944
  unqualified: 243
  minimally-qualified: 1029
  component: 9
emoji with curated alternate senses: 570
curated senses total: 823
```

```
dist/emoji17.html  2.58 MB  (5225 records inlined)
ℹ tests 94
ℹ pass 94
ℹ fail 0
```

If the row counts moved but the tests pass, Unicode published a revision — see
below. If the row counts moved and tests fail, the parse broke.

## When Emoji 18.0 lands

The Unicode path convention changed at 17.0 and may not be stable, so start by
finding the files rather than assuming a path.

1. **Locate the data.** Check `unicode.org/Public/emoji/latest/` and
   `unicode.org/Public/18.0.0/emoji/`. As of 17.0 the live location is
   `/Public/<full-version>/emoji/`, with `emoji-data.txt` and
   `emoji-variation-sequences.txt` under `/Public/<full-version>/ucd/emoji/`.
   The old `/Public/emoji/<version>/` tree stopped receiving releases after
   16.0.

2. **Update `build/sources.mjs`.** Set `EMOJI_VERSION`, repoint the seven URLs
   in `SOURCES`, and append the new `emoji-test.txt` to `HISTORICAL_TEST_FILES`
   so the version cross-validation keeps covering the newest release.

3. **Refetch and rebuild.**
   ```bash
   node build/fetch.mjs --force
   node build/dataset.mjs
   node build/bundle.mjs
   ```

4. **Update the pinned expectations.** Three tests deliberately hard-code
   current facts so a silent upstream change cannot pass unnoticed:
   - `test/dataset.test.mjs` — the `3944` fully-qualified count, the
     `emojiVersion` equal to `'17.0'`, the "newest version is 17" assertion, and
     the two E17.0 spot-checks (`fight cloud`, `distorted face`).
   - `test/dataset.test.mjs` — add the new version pair to the cross-validation
     `pairs` array.
   - `src/shell.html` and the `<title>` — the version in the heading.

5. **Extend the version cross-validation pairs.** In
   `test/dataset.test.mjs`, add `['17.0', '18.0']` to `pairs` and `'18.0'` to
   the snapshot list.

6. **Look at the new emoji and consider curating them.**
   ```bash
   node src/cli.mjs 'v:18'
   ```
   New characters routinely arrive with a `platform` sense worth recording —
   they are unrenderable tofu boxes on most devices for months after
   standardisation, which is itself the most useful thing to know about them.

7. **Re-run everything.** `npm run verify`.

## Regenerating just the page

If you have only changed `src/shell.html`, `src/app.mjs` or `src/search.mjs`:

```bash
node build/bundle.mjs && node --test 'test/*.test.mjs'
```

The bundle test compares the embedded engine and UI against the repository
sources character for character, so forgetting to re-bundle after an edit fails
loudly instead of shipping a stale page.

## Regenerating just the data

If you have only edited `data/alt-usages/`:

```bash
node build/dataset.mjs && node build/bundle.mjs && node --test 'test/*.test.mjs'
```

Watch the build's `by register` summary and the `UNRESOLVED alt keys` line —
those two catch most authoring mistakes before the tests do.
