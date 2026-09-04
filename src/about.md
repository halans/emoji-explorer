# A thesaurus for emoji

Most emoji references are dictionaries: they tell you what a picture is
called. Emojisaurus tells you what it means, and lets you search from a
meaning back to the emoji that carries it.

- **Dictionary** — word → meaning
- **Thesaurus** — meaning → word

Emoji need the second.

Emoji {{version}} · {{fq}} fully-qualified characters · {{senses}} curated
senses · {{registers}} registers · {{rows}} total rows indexed · 0
dependencies, trackers or network calls.

[Open the explorer]({{appUrl}}) — the interactive, self-contained search tool.

## The origin of emoji

**Emoji** is Japanese: 絵文字, from *e* (絵, picture) and *moji* (文字,
character). The resemblance to the English *emotion* and to *emoticon* (the
older `:-)` tradition) is a complete coincidence.

The origin story is usually told as: Shigetaka Kurita designed 176 emoji for
NTT DoCoMo's i-mode in 1999, and the Museum of Modern Art later acquired the
set. That story is wrong, and Emojipedia formally corrected it in 2019.
SoftBank shipped a 90-emoji set on the J-Phone SkyWalker DP-211SW in 1997 (two
years earlier), and it included the ancestor of 💩. Researchers have since
pushed the date back further still, to picture-character sets on Japanese
word processors such as the Toshiba JW 95F and Sharp PA-8500 in 1988. Kurita's
set is the famous one, not the first one.

Emoji reached the rest of the world through Unicode. Version 6.0, in 2010, was
the first to encode them at scale, which is why an emoji is a character in the
same technical sense as `A` or `漢`. It has a code point, an encoded byte
length, and a name assigned by committee. This project covers **Emoji
{{version}}**, released alongside Unicode {{version}} in September 2025:
**{{fq}}** fully-qualified emoji, and **{{rows}}** rows once you count the
partially-qualified spellings that also occur in the wild.

## Why emoji are hard to look up

Every emoji has an official name, assigned by Unicode and CLDR. Those names
describe the picture, faithfully and uselessly:

- 💀 is `skull`, and means laughter.
- 🧢 is `billed cap`, and means someone is lying.
- 😤 is `face with steam from nose`, a manga convention for triumph, and
  reads as indignation.
- 🏩 is `love hotel`, which really is the official name, for a specific
  Japanese institution most people outside Japan have never heard of.

Three things make this worse. Emoji are **polysemous**: one glyph carries many
unrelated senses at once. 🙏 has seven here, spanning six registers, and none
of them is wrong. Meanings are **regional**: 👌 👍 🤘 ✌️ are obscene in some
countries and neutral in others, and the anglophone consensus that 😂 is "for
old people" is not shared across Brazil, Indonesia or much of Africa. And
meanings **drift**, quickly, in ways no committee ratifies.

## So what is a thesaurus?

The word is Latin *thēsaurus*, from Ancient Greek *thēsauros*: a treasure
house or storehouse. Not a list of synonyms: a store of things worth keeping,
arranged so you can find them.

Peter Mark Roget (a physician and secretary of the Royal Society) began
compiling one for his own use in 1805 and published *Thesaurus of English
Words and Phrases* on 29 April 1852. Its radical move was the arrangement. A
dictionary is alphabetical: you arrive knowing the word and leave knowing the
meaning. Roget inverted it, organising roughly 1,000 conceptual categories
under six classes: Abstract Relations, Space, Matter, Intellect, Volition,
Affections. This let you arrive knowing only the idea and leave with the words
that express it. The alphabetical index most people actually use was added
afterwards, as a way back in.

## Why this one is a thesaurus

It carries both layers, and they do different jobs.

The **dictionary layer** is mechanical and complete: the official CLDR name
and keywords for all {{fq}} fully-qualified emoji, plus the encoding facts
(code points, UTF-8 byte size, UTF-16 units). That layer is authoritative and
it is not mine; it comes straight from Unicode.

The **thesaurus layer** is the hand-written part, and it is what this project
is actually for: **{{senses}}** curated senses across **{{emoji}}** emoji,
sorted into **{{registers}}** registers: {{registerList}}.

Each groups senses by the world they belong to, so that 🧊 landing in five
different registers tells you something real about the glyph rather than
looking like a contradiction.

## Where the dictionary layer comes from

Every name and keyword in here is **CLDR** data: the Unicode Consortium's
*Common Locale Data Repository*, and much less famous than the character
standard itself.

Unicode proper says what characters exist. CLDR says how to present things to
humans in a given language and place. You have almost certainly used it today
without noticing — it is the data behind ICU, which Java, Android, iOS,
macOS, Windows, PHP and JavaScript's `Intl` API all rely on.

This project reads two of its files, and takes three things from them:

- **Names.** The short name on every row: "grinning face", "billed cap".
- **Keywords.** What `kw:` searches: **{{keywordCount}}** of them across the
  {{fq}} fully-qualified emoji, averaging **{{keywordAvg}}** each.
- **Order.** The sequence rows appear in, and the tiebreaker when two results
  score equally — CLDR collation order, the same order Unicode recommends for
  keyboard palettes.

CLDR keywords are more sense-aware than the names suggest — 😤 carries both
`triumph` and `anger`, and 💀 carries `lmao` — but CLDR does not adjudicate or
explain. It won't tell you anger has displaced triumph, or that 💀 became the
standard laughter marker around 2020 as 😂 aged out, and it has no grouping
(you cannot ask CLDR for "the finance vocabulary"). It is also conservative by
design: 🧢 gets `baseball · bent · billed · cap · dad · hat` and nothing about
lying; 🚩 gets `construction · flag · golf · post` and nothing about
dealbreakers. Those gaps are what the curated layer is for.

**An unexploited angle.** CLDR ships these annotations in around a hundred
languages. This project reads only the English file. Swapping in the German or
Japanese one would localise the entire dictionary layer essentially for free.
The curated senses would stay English, but the searchable names and keywords
would not have to.

## It runs in both directions

This is the part a plain emoji picker cannot do. Every example below opens the
explorer with the query already run.

- `alt:lying` — **meaning → emoji.** You know the idea, not the picture.
  Finds 🧢.
- `alt:"red flag"` — the dealbreaker sense, not the object. Finds 🚩.
- 🫡 (paste a glyph) — **emoji → meanings.** Decode a message someone sent
  you.
- `reg:misread` — a whole register: official names nobody recognises.
- `bytes:>25` — **neither.** The encoding questions a thesaurus has no
  opinion on, but a byte does.
- `v:17` — everything new in Emoji 17.0.

## What this is not

The curated layer is deliberately partial and openly subjective. There is no
clean, current, licensable dataset of emoji *sense*. EmojiNet is a decade
stale and its API is gone, the crowd-sourced Emoji Dictionary is unlicensed
and noisy, and the academic corpora cover a couple of dozen glyphs. So every
sense here was written by hand, tagged with a confidence of high, medium or
low, and attributed in its source file to the class of evidence it rests on.
Treat it as a curated reference, not a measurement. Where nothing is recorded,
the literal name really is all there is.

**Explicit senses are off by default.** Three registers (`sexual`, `kink` and
`substances`) sit behind a toggle. They are documented for the same reason a
slang dictionary documents slang: moderation, safeguarding and plain
comprehension need them. The gate is enforced in the search index rather than
the display, so no query of any shape surfaces them while it is closed.

## Sources

Emoji and encoding data: the Unicode Consortium (`emoji-test.txt`, Emoji
{{version}}) and the CLDR annotation files, under the
[Unicode Licence v3](https://www.unicode.org/license.txt). Emoji origin
corrections: Emojipedia's 2019 research note on the first emoji set. Roget:
*Thesaurus of English Words and Phrases*, 1852. Glyphs are drawn by your own
device's emoji font (no vendor artwork is redistributed here, which is also
why the newest Emoji {{version}} characters may show as empty boxes). Code and
curated prose are MIT. Dataset built {{built}}. Shout out to the original,
archived Emojisaurus.com emojigrams reference.

---

[Open the explorer]({{appUrl}}) · [Canonical page]({{canonicalUrl}})
