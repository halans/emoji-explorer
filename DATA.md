# Data

## Upstream sources

All URLs are declared in `build/sources.mjs`. Checksums for the exact files used
are in `data/raw/manifest.json` after a fetch.

### Emoji 17.0 (current)

| File | URL | Supplies |
|---|---|---|
| `emoji-test.txt` | `unicode.org/Public/17.0.0/emoji/emoji-test.txt` | the canonical row list: code points, qualification status, CLDR order, group/subgroup, and the `E<version>` first-appearance marker |
| `emoji-sequences.txt` | `unicode.org/Public/17.0.0/emoji/` | sequence property names (`Basic_Emoji`, `RGI_Emoji_Flag_Sequence`, `RGI_Emoji_Tag_Sequence`, …) |
| `emoji-zwj-sequences.txt` | `unicode.org/Public/17.0.0/emoji/` | `RGI_Emoji_ZWJ_Sequence` membership |
| `emoji-data.txt` | `unicode.org/Public/17.0.0/ucd/emoji/` | per-code-point emoji properties |
| `emoji-variation-sequences.txt` | `unicode.org/Public/17.0.0/ucd/emoji/` | text/emoji presentation VS pairs |
| `common/annotations/en.xml` | `raw.githubusercontent.com/unicode-org/cldr/main/` | English keywords + `tts` short names, base emoji |
| `common/annotationsDerived/en.xml` | `raw.githubusercontent.com/unicode-org/cldr/main/` | the same for derived forms: skin tones, ZWJ families, flags |

> **Path change worth recording.** The `/Public/emoji/<version>/` directory tree
> ends at **16.0**. `unicode.org/Public/emoji/17.0/emoji-test.txt` returns
> **404**. From Unicode 17.0 the emoji data files moved to
> `/Public/17.0.0/emoji/`, with `emoji-data.txt` and
> `emoji-variation-sequences.txt` under `/Public/17.0.0/ucd/emoji/`. Verified
> 2026-08-23; `/Public/emoji/latest/` still resolves and is a reasonable
> fallback probe.

### Historical snapshots

Fetched to back an independent cross-validation test, not to derive anything.

`emoji-test.txt` exists only from **Emoji 4.0** onward — the 1.0, 2.0 and 3.0
directories have no such file. For those three versions the fetcher pulls what
does exist (`emoji-data.txt` for 1.0; data + sequences + ZWJ for 2.0 and 3.0),
from which a version's membership set can be reconstructed. Emoji 1.0's
`emoji-data.txt` already contains multi-code-point rows for keycaps and flags,
which is why it ships no separate sequence files.

## Licensing

| Asset | Licence |
|---|---|
| Unicode data files | [Unicode Licence v3](https://www.unicode.org/license.txt) |
| CLDR annotations | Unicode Licence v3, SPDX `Unicode-3.0` |
| Project code | MIT |
| Curated alternate-usage prose | Original writing, MIT with the code |

Emoji *glyphs* are rendered by the reader's own platform font (Apple Color
Emoji, Noto Color Emoji, Segoe UI Emoji). No vendor artwork is redistributed —
which is also why brand-new Emoji 17.0 characters may show as missing-glyph
boxes on systems whose fonts have not caught up.

## Record schema

One record per `emoji-test.txt` row. Real example, `data/dataset.json`:

```json
{
  "id": "1F9D1-200D-1F680",
  "key": "1F9D1-200D-1F680",
  "emoji": "🧑‍🚀",
  "name": "astronaut",
  "cldrName": "astronaut",
  "group": "People & Body",
  "subgroup": "person-role",
  "status": "fully-qualified",
  "version": "12.1",
  "codePoints": ["U+1F9D1", "U+200D", "U+1F680"],
  "cpCount": 3,
  "utf8Bytes": 11,
  "utf16Units": 5,
  "utf8Hex": ["F0","9F","A7","91","E2","80","8D","F0","9F","9A","80"],
  "kind": "zwj",
  "sequenceProperty": "RGI_Emoji_ZWJ_Sequence",
  "hasVS16": false,
  "toneCount": 0,
  "tones": [],
  "parentKey": null,
  "isToneComponent": false,
  "parentId": null,
  "keywords": ["astronaut", "rocket", "space"],
  "toneVariants": [
    "1F9D1-1F3FB-200D-1F680",
    "1F9D1-1F3FC-200D-1F680",
    "1F9D1-1F3FD-200D-1F680",
    "1F9D1-1F3FE-200D-1F680",
    "1F9D1-1F3FF-200D-1F680"
  ],
  "order": 1316,
  "altUsages": []
}
```

### Field derivations

| Field | How it is produced |
|---|---|
| `id` | exact code points, hex, `-`-joined. **Unique** — the primary key. |
| `key` | same with `U+FE0F` stripped. **Deliberately not unique**: the fully-qualified and minimally-qualified spellings of one emoji share it, which is how CLDR and curated data attach to both. |
| `emoji` | `String.fromCodePoint(...)` over the row's code points. A test asserts every record round-trips. |
| `name`, `group`, `subgroup`, `status` | verbatim from `emoji-test.txt`. |
| `version` | the inline `E<version>` marker in `emoji-test.txt`. Present for all 5,225 rows and reaching back to E0.6, which predates Emoji 1.0. Cross-validated against the historical snapshots: an emoji declared E13.0 must be absent from the 12.1 file and present in the 13.0 one. |
| `cpCount` | `codePoints.length`. Counts **all** code points including ZWJ and variation selectors, because they are what you actually store and transmit. |
| `utf8Bytes` | `Buffer.byteLength(emoji, 'utf8')`. Measured, never computed from a rule. A test recomputes it independently and also bounds-checks it against `[cpCount, cpCount × 4]`. |
| `utf16Units` | `emoji.length` — i.e. what JavaScript's `.length` reports, which is why it differs from both other counts. |
| `utf8Hex` | the actual encoded bytes. Dropped from the browser bundle and rebuilt there with `TextEncoder`; a test asserts the two agree for all 5,225 rows. |
| `kind` | structural classification from the code points: `single`, `zwj`, `flag`, `keycap`, `tag-flag`, `modifier`, `sequence`. |
| `toneCount`, `tones`, `parentId`, `toneVariants` | skin-tone modifiers are `U+1F3FB`–`U+1F3FF`. Removing them yields the tone-neutral parent. Families link fully-qualified rows only, as a strict bijection that a test verifies in both directions. |
| `isToneComponent` | true for the five bare modifier characters themselves, which are *entirely* tone and therefore have no parent. |
| `keywords` | CLDR `annotationsDerived` preferred, falling back to `annotations`, unioned. 100% coverage of fully-qualified emoji is asserted. |
| `order` | the row's index in `emoji-test.txt`, i.e. CLDR order — the sequence Unicode recommends for keyboard palettes. Used as the stable tiebreak in ranking. |

### Distributions

Structural kinds across all 5,225 rows:

```
zwj 2667   single 1602   modifier 670   flag 259   keycap 24   tag-flag 3
```

Fully-qualified emoji by version added:

```
E0.6:719  E0.7:139  E1.0:485  E2.0:286  E3.0:157  E4.0:598  E5.0:239
E11.0:157 E12.0:230 E12.1:168 E13.0:117 E13.1:217 E14.0:112 E15.0:31
E15.1:118 E16.0:8   E17.0:163
```

The **163** at E17.0 independently reproduces the figure Emojipedia publishes
for Emoji 17.0, which is a useful check that the parse is not dropping rows.
Collapsed to tone-neutral forms it is 8 genuinely new base emoji — fight cloud,
distorted face, hairy creature, ballet dancer, orca, landslide, trombone,
treasure chest — because much of the rest of the release is new skin-tone and
gender sequences for emoji that already existed (people with bunny ears, people
wrestling).

UTF-8 byte sizes for fully-qualified emoji range from **3** to **35**:

- **3 bytes** — 60 emoji, all single BMP code points in the `U+2600`–`U+27BF`
  Miscellaneous Symbols / Dingbats blocks that need no variation selector to
  present as emoji: ✋ `U+270B`, ☕ `U+2615`, ⛪ `U+26EA`, ⛲ `U+26F2`.
- **4 bytes** — the largest bucket, 1,124 emoji: the astral-plane single code
  points most people picture when they think "an emoji".
- **35 bytes** — the maximum, `🧑🏻‍❤️‍💋‍🧑🏼`: ten code points, six of them
  structural (two ZWJ-joined people, two skin-tone modifiers, a heart, a kiss
  mark), rendering as **one** perceived character.

That spread is the reason byte size is a first-class column here. A "character"
in this set can cost anywhere from 3 to 35 bytes, and nothing in the glyph tells
you which.

## The curated alternate-usage layer

### Why it is hand-written

There is no clean, licensable, current open dataset for this. What exists:

- **EmojiNet** (Wijeratne et al., 2016–17) — the largest machine-readable emoji
  sense inventory built, 12,904 sense labels over 2,389 emoji, but derived from
  the uncurated crowd-sourced Emoji Dictionary via BabelNet, now a decade stale,
  and its `emojinet.knoesis.org` service is gone.
- **The Emoji Dictionary** — crowd-sourced, unvalidated, hundreds of noisy
  submissions per emoji, no clear redistribution licence.
- **Academic sense corpora** (e.g. Shardlow et al., *One emoji, many meanings*)
  — methodologically strong but cover only nine to twenty emoji.
- **Emojipedia** — well written by actual lexicographers, but free prose, not
  machine-readable, and not redistributable.

So the layer here is deliberately partial and explicitly attributed rather than
scraped. Each thematic file carries a `provenance` note describing what class of
evidence its senses rest on, and each sense carries a `confidence` of `high`,
`medium` or `low`. `high` means the sense is documented in mainstream press,
platform policy or academic work; `low` means it is real but niche or regional.
Treat this as a curated reference, not a corpus measurement.

### Registers

| Register | Emoji | Senses | Files | What it covers |
|---|---|---|---|---|
| `internet` | 92 | 95 | 2 | meme-derived senses: 🚩 red flag, 🧢 cap/lying, 🐐 GOAT, 🍵 tea, 🧠 brainrot, 🪫 no social energy |
| `misread` | 84 | 84 | 2 | official names nobody recognises: 😤 is "face with steam from nose", 🍢 is oden, ♨️ is an onsen, 🩸 began as a period-stigma campaign |
| `sexual` | 78 | 78 | 3 | **gated.** Euphemism, anatomy and acts, and algospeak — the register moderation systems treat as primary |
| `irony` | 72 | 75 | 2 | tone inversion, the largest source of name/meaning drift: 💀 laughter, 🙂 passive aggression, ✨sarcasm quotes✨, 🤔 insinuation |
| `workplace` | 62 | 62 | 2 | protocol use in Slack, code review and on-call: ✅ done, 👀 reviewing, 💥 breaking change, 📟 being paged, 🪄 AI feature |
| `subculture` | 46 | 48 | 1 | in-group markers: fandom, programming-language mascots (🦀 Rust, 🐧 Linux, 🐳 Docker), platform logos |
| `nonenglish` | 45 | 47 | 1 | senses from non-anglophone internet: 🍐 goodbye in Mandarin homophone slang, 🙇 a real apology in Japanese, 🫰 the Korean finger heart |
| `everyday` | 44 | 44 | 1 | mundane written shorthand: 🛏️ bedroom count in listings, 📦 delivery tracking, 🧾 splitting a bill, 🤒 off sick |
| `sports` | 38 | 38 | 1 | fandom and transfer-rumour grammar: 🚨 breaking transfer news, ✅ "here we go", 🟨 a booking, 👑 LeBron |
| `religion` | 36 | 36 | 1 | devotional and ritual senses, including substitutions forced by a thin symbol set: 🤲 dua, 🪔 Diwali, 🪯 the Khanda |
| `dating` | 36 | 36 | 1 | app-profile disclosure grammar: 📏 height, ♑ star sign, 👻 ghosting, 🚩 dealbreaker, 🟢 green flag |
| `politics` | 35 | 35 | 1 | movement signalling, including symbols appropriated by extremist groups |
| `regional` | 33 | 35 | 1 | gesture and cultural divergence, including gestures that are obscene in some countries (👌 👍 🤘 ✌️) |
| `kink` | 32 | 32 | 1 | **gated.** Community taxonomy and BDSM/fetish signalling — a classification system, not euphemism |
| `finance` | 31 | 31 | 1 | trading and crypto: 🚀 to the moon, 💎🙌 diamond hands, 🧻 paper hands, 🦍 retail cohort |
| `substances` | 25 | 25 | 1 | **gated.** Drug-trade codes, as published in DEA and platform trust-and-safety guidance |
| `platform` | 22 | 22 | 1 | vendor-dependent meaning: 🔫 became a water pistol everywhere, ❤️ needs `U+FE0F` |

**823 senses across 570 emoji in 17 registers.** Three senses attach to
two-emoji combos rather than single glyphs. Tone variants inherit their
parent's senses.

A register may be spread across several files — a base pass plus later
deepening passes — and the loader accumulates them rather than letting the
second file overwrite the first's metadata. `sexual` spans three: euphemism,
anatomy and acts, and algospeak.

#### Why `sexual` and `kink` are separate

They answer different questions. `sexual` decodes a **euphemism in a message**:
you have a glyph and need to know what it stands in for. `kink` decodes an
**affiliation declared in a profile**: a classification system with its own
published community glossaries, in which 🐻 🦦 🐺 🐷 🐶 are self-descriptive
terms rather than slang. Keeping them apart means someone auditing a DM and
someone decoding a bio are not wading through each other's vocabulary. Both are
gated identically.

#### Polysemy

The senses stack, and the stacking is the interesting part:

| Emoji | Senses | Registers |
|---|---|---|
| 🙏 | 7 | internet, regional, misread, religion, nonenglish, workplace |
| 🧊 | 7 | internet, finance, workplace, sports, dating, kink |
| 🫡 | 5 | irony, finance, workplace, nonenglish |
| 🤝 | 5 | internet, finance, platform, sports, workplace |
| 🐍 | 5 | sexual, internet, subculture, sports |
| 🧿 | 5 | internet, misread, politics, dating |

🙏 is the clearest case in the set: it depicts the Japanese gassho gesture, is
read as prayer by religious users, as thanks or please by most Western users, as
a high five by a persistent minority, as a politeness particle in Japanese
messaging, and as a favour request in work channels. One glyph, six mutually
incompatible readings, none of them wrong.

### The explicit gate

`sexual`, `substances` and `kink` are hidden unless the *explicit senses*
toggle is on — 187 senses once tone-variant inheritance is counted.
The gate is enforced at the **index** level, not the display level:
`buildIndex` precomputes two views of every record, and with the gate closed the
engine matches against the view in which explicit senses do not exist. There is
therefore no query shape — free text, `alt:`, `reg:`, fuzzy — that can surface
them. Earlier this was a post-hoc filter and `reg:substances` leaked straight
through it; the test that caught that is still in the suite, alongside three
exhaustive sweeps over every gated sense.

The third sweep exists because of a subtlety worth naming. Some gated labels are
ordinary English words that legitimately appear in the *same emoji's ungated*
text — 🦦's `subculture` gloss contains "otter", which is also its `kink` sense
label. That emoji stays reachable by the word "otter" through its clean sense,
which is correct; what must never happen is the gated sense being **displayed**.
So one sweep asserts no gated sense is ever shown (strict, no exemptions), and
another asserts unreachability with a *computed* exemption for those word
collisions, capped at 10% of gated senses so it cannot quietly grow into a
loophole. Currently 3 of 187 collide.

A per-sense `explicit` flag can override its file's default, and a test asserts
the override only ever *tightens*: a sense in a clean register may opt in to
gating (🧠 does), but a sense inside a gated register can never opt out.

An emoji with senses in both classes stays findable through its clean ones —
🍑 remains reachable via its `platform` sense with the gate shut.

### Extending the curated layer

Files in `data/alt-usages/`, merged in filename order. Add to an existing file,
drop in a new register, or add a second file for an existing register (the
`-extended` files do exactly that — a register's metadata accumulates across
files rather than the later one overwriting the earlier):

```json
{
  "register": "internet",
  "explicit": false,
  "provenance": "One sentence on what class of evidence these rest on.",
  "entries": {
    "🫠": [
      {
        "sense": "short label",
        "gloss": "A sentence or two of actual explanation.",
        "confidence": "high"
      }
    ]
  }
}
```

Then `node build/dataset.mjs && node build/bundle.mjs`.

Rules the build and tests enforce:

- Keys are **emoji glyphs**, not code points. They are normalised with `FE0F`
  stripped, so either spelling attaches correctly.
- Senses from *different* files accumulate on the same emoji. 🐍 legitimately
  carries four: a euphemism, "betrayer", a Taylor Swift reference and Python.
- A **duplicate key within one file** throws at build time. `JSON.parse` would
  silently keep only the last and drop the rest — this actually happened while
  authoring, which is why both the build and a test check for it.
- Every sense needs `sense`, `gloss` and a valid `confidence`.
- A key that matches no emoji is reported as `UNRESOLVED` and fails the tests.
- A key naming **two** emoji (`👉👈`, `🌈🐻`) is split into its constituents and
  the sense is attached to each, tagged with the combo it belongs to, so
  searching either half finds it.
- Any register named in the explicit set must have its senses flagged
  `explicit`; a test enforces this, so a new sensitive register cannot be added
  without gating it.
