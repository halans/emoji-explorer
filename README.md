# Emojisaurus - Emoji 17.0 Explorer

A single-page app for exploring and searching the complete Emoji 17.0 set in a
dense table, with **code point count** and **UTF-8 byte size** as first-class,
sortable, queryable columns — plus a curated layer of **alternate usages**
(slang, ironic, regional, technical) that the official Unicode names never
capture.

Zero runtime dependencies. The build is plain Node with no packages installed;
the output is one self-contained HTML file that runs offline.

```
dist/emoji17.html    2.54 MB    5,225 records inlined, no network required
```

## What's in it

| | |
|---|---|
| Rows | **5,225** total — 3,944 fully-qualified, 1,029 minimally-qualified, 243 unqualified, 9 components |
| Curated alternate senses | **823** senses across **570** emoji, in **17** registers |
| CLDR keyword coverage | 100% of fully-qualified emoji |
| Data vintage | Emoji 17.0, `emoji-test.txt` dated 2025-08-04 |

Every emoji row carries: the glyph, CLDR name, group and subgroup,
qualification status, version added, the full code point list, **code point
count**, **UTF-8 byte size**, UTF-16 unit count, structural kind (single, ZWJ,
flag, keycap, tag-flag, modifier), skin-tone family links, CLDR keywords, and
any curated alternate senses.

## Quick start

```bash
node build/fetch.mjs      # download + checksum upstream sources (once)
node build/dataset.mjs    # parse, join, compute -> data/dataset.json
node build/bundle.mjs     # inline everything -> dist/emoji17.html
node --test 'test/*.test.mjs'   # 94 tests
```

Or `npm run verify` to do all four. Then open `dist/emoji17.html` in a browser —
no server needed. It works on a phone as well as a desktop; see
[Responsive layout](#responsive-layout).

There is also a CLI over the identical engine:

```bash
node src/cli.mjs 'bytes:>25'
node src/cli.mjs --explicit 'reg:sexual'
node src/cli.mjs --json 'alt:lying'
```

## The search language

Free text searches names, CLDR keywords and alternate senses at once, ranked by
where the match landed. Beyond that:

| Syntax | Example | Meaning |
|---|---|---|
| `name:` | `name:fox` | scope to the CLDR name |
| `kw:` | `kw:ocean` | CLDR keyword |
| `alt:` | `alt:lying` | curated alternate sense |
| `reg:` | `reg:finance` | alternate-usage register |
| `group:` `sub:` | `sub:face-smiling` | group / subgroup |
| `v:` | `v:17` | version added |
| `cp:` | `cp:1F600` | code point (hex, `U+` optional) |
| `kind:` | `kind:tag-flag` | structural kind |
| `status:` | `status:component` | qualification status |
| `bytes:` | `bytes:>25`, `bytes:4..7` | UTF-8 size, with `> < >= <= =` and ranges |
| `cps:` | `cps:3` | code point count |
| `units:` | `units:2` | UTF-16 code units |
| `tones:` | `tones:0` | skin-tone modifier count |
| `"..."` | `"red flag"` | phrase |
| `-` | `-name:cheese` | negation |
| `OR` | `kw:ocean OR kw:space` | alternation |
| paste | `🧑‍🚀` | paste any emoji to find its record |

Terms are ANDed unless joined by `OR`. Aliases work (`keywords:`, `slang:`,
`size:`, `version:`, `hex:` …). A term of four characters or more that matches
nothing falls back to edit-distance matching, so `croissnt` still finds 🥐; the
status bar says when that happened.

Numeric filters are the point of the byte/code-point columns — they turn a
reference table into something you can interrogate:

```
$ node src/cli.mjs --limit 5 'bytes:>25'
query: bytes:>25
6 matches, showing 5

  em  bytes  cps  ver    name / matched on
  ──  ─────  ───  ─────  ───────────────────────────────────────────
  👩‍❤️‍💋‍👨     27    8  E2.0   kiss: woman, man  [bytes]
  👨‍❤️‍💋‍👨     27    8  E2.0   kiss: man, man  [bytes]
  👩‍❤️‍💋‍👩     27    8  E2.0   kiss: woman, woman  [bytes]
  🏴󠁧󠁢󠁥󠁮󠁧󠁿     28    7  E5.0   flag: England  [bytes]
  🏴󠁧󠁢󠁳󠁣󠁴󠁿     28    7  E5.0   flag: Scotland  [bytes]
         └ platform: tag sequence with poor support
```

Only six emoji in the whole set exceed 25 bytes as tone-neutral forms; with skin
tones expanded the heaviest is `🧑🏻‍❤️‍💋‍🧑🏼` at **35 bytes for one perceived
character**.

## Alternate usages

The official CLDR name for 💀 is "skull" and for 🧢 is "billed cap". Neither is
what those emoji mean in use. This project carries two layers:

- **CLDR keywords** — mechanical, complete, authoritative, all 3,944 emoji.
- **Curated senses** — hand-authored, partial, each with a register,
  a plain-language gloss and a confidence rating.

| Register | Emoji | Senses | | Register | Emoji | Senses |
|---|---|---|---|---|---|---|
| `internet` | 92 | 95 | | `religion` | 36 | 36 |
| `misread` | 84 | 84 | | `dating` | 36 | 36 |
| `sexual` ⚠ | 78 | 78 | | `politics` | 35 | 35 |
| `irony` | 72 | 75 | | `regional` | 33 | 35 |
| `workplace` | 62 | 62 | | `kink` ⚠ | 32 | 32 |
| `subculture` | 46 | 48 | | `finance` | 31 | 31 |
| `nonenglish` | 45 | 47 | | `substances` ⚠ | 25 | 25 |
| `everyday` | 44 | 44 | | `platform` | 22 | 22 |
| `sports` | 38 | 38 | | | | |

⚠ = behind the explicit toggle.

Senses stack: 🙏 and 🧊 carry seven each — 🙏 across six registers (thanks,
high-five folk reading, the gassho gesture it actually depicts, genuine prayer,
a Japanese politeness particle, a work-channel favour request). 🫡 🤝 🐍 🧿
carry five each.

`sexual`, `substances` and `kink` sit behind an off-by-default **explicit
senses** toggle. The gate is enforced in the index, not in the display: with it closed
those senses do not exist as far as the query engine is concerned, so no query
of any shape can surface them. Three exhaustive tests check every gated
sense from both directions, including one that separates a real leak from a
label word that legitimately appears in the same emoji's ungated text.

Adding your own is a JSON edit — see [DATA.md](DATA.md#extending-the-curated-layer).

## Responsive layout

The page serves two layouts from one codebase, switched on a `matchMedia`
breakpoint at **820px** — never on user-agent sniffing, which breaks on
desktop-mode-on-phone and on resize.

| | Desktop (>820px) | Mobile (≤820px) |
|---|---|---|
| Results | 9-column sortable grid, 44px rows | Card list, 76px rows — glyph, name, metric strip |
| Detail | 380px side panel, always visible | Bottom sheet over a scrim, opens on tap |
| Sorting | Click a column header | `sort` select + direction button |
| Query help | 24 chips always visible | Collapsed behind a disclosure, capped and scrollable |
| Search input | 13px | **16px** — below that, iOS Safari zooms on focus and traps the user |

Both layouts are fed by the same engine and the same virtualiser: the card is
fixed-height too, so windowing is unchanged. Nothing is removed on mobile —
every field, filter and gated-register toggle is still reachable.

Three details that mattered more than they look:

- **The column grid needed 430px minimum.** On a 390px screen it clipped 50px
  off every row with `overflow-x: hidden`, so the byte and version columns were
  unreachable. Cards have no fixed columns and nothing to clip.
- **`100dvh`, not `100vh`.** The mobile URL bar changes `vh` mid-scroll and
  strands content off-screen.
- **The app shell owns its own box.** `#shell` is `position: fixed` on mobile
  because an embedding host can inject its own `<body>` children — the publish
  wrapper injects two 154px iframes, which squeezed `main` from 575px to 267px
  and left the table with **zero** height.

`test/bundle.test.mjs` guards all of this: viewport meta, the breakpoint, dvh,
the sheet, safe-area insets, reduced-motion, the 16px input, the shell wrapper,
and that the UI never reads `navigator.userAgent`.

## Documentation

- **[BUILDING.md](BUILDING.md)** — the build pipeline, stage by stage, and how to extend the code
- **[DATA.md](DATA.md)** — record schema, every upstream source, licensing, and the derivation of each computed field
- **[RECREATING.md](RECREATING.md)** — rebuilding from an empty directory, and what to do when Emoji 18.0 lands

## Licence

Project code: MIT.
Unicode data files: [Unicode Licence v3](https://www.unicode.org/license.txt).
CLDR annotations: Unicode Licence v3 (SPDX `Unicode-3.0`).
The curated alternate-usage text is original prose, MIT alongside the code.
