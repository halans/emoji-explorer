// Single source of truth for every upstream data file this project consumes.
//
// Emoji 17.0 note: the historical /Public/emoji/<version>/ tree stops at 16.0.
// Starting with Unicode 17.0 the emoji data files moved under
// /Public/17.0.0/emoji/ (and /Public/17.0.0/ucd/emoji/). Most third-party
// tooling still points at the old path and 404s. Verified 2026-08-23.

export const EMOJI_VERSION = '17.0';

export const SOURCES = {
  'emoji-test.txt': {
    url: 'https://www.unicode.org/Public/17.0.0/emoji/emoji-test.txt',
    role: 'Canonical emoji list: code points, qualification status, CLDR order, group/subgroup.',
  },
  'emoji-sequences.txt': {
    url: 'https://www.unicode.org/Public/17.0.0/emoji/emoji-sequences.txt',
    role: 'Sequence classification: Basic_Emoji, Emoji_Keycap_Sequence, RGI_Emoji_Flag_Sequence, RGI_Emoji_Tag_Sequence, RGI_Emoji_Modifier_Sequence.',
  },
  'emoji-zwj-sequences.txt': {
    url: 'https://www.unicode.org/Public/17.0.0/emoji/emoji-zwj-sequences.txt',
    role: 'RGI zero-width-joiner sequences.',
  },
  'emoji-data.txt': {
    url: 'https://www.unicode.org/Public/17.0.0/ucd/emoji/emoji-data.txt',
    role: 'Per-code-point emoji properties (Emoji, Emoji_Presentation, Emoji_Modifier_Base, ...).',
  },
  'emoji-variation-sequences.txt': {
    url: 'https://www.unicode.org/Public/17.0.0/ucd/emoji/emoji-variation-sequences.txt',
    role: 'Text/emoji presentation variation selector pairs.',
  },
  'cldr-annotations.xml': {
    url: 'https://raw.githubusercontent.com/unicode-org/cldr/main/common/annotations/en.xml',
    role: 'CLDR English keywords + short names (base emoji).',
  },
  'cldr-annotations-derived.xml': {
    url: 'https://raw.githubusercontent.com/unicode-org/cldr/main/common/annotationsDerived/en.xml',
    role: 'CLDR English keywords + short names (derived: skin tones, ZWJ families, flags).',
  },
};

// Historical snapshots, oldest first. Diffing these yields the "version added"
// for every emoji without needing a third-party dataset.
//
// emoji-test.txt only exists from Emoji 4.0 onward (verified: the 1.0/2.0/3.0
// directories have no such file). For 1.0-3.0 we reconstruct the emoji set from
// that version's emoji-data.txt (single code points carrying the Emoji
// property) unioned with its emoji-sequences.txt and emoji-zwj-sequences.txt.
// Keys are normalised with FE0F stripped, so a bare code point in emoji-data
// still matches its fully-qualified form in emoji-test.
export const HISTORICAL_COMPOSED = [
  {
    version: '1.0',
    // Emoji 1.0 shipped a single file. Its own emoji-data.txt already carries
    // multi-code-point rows (keycaps, flags), so no sequence files exist.
    files: {
      data: 'https://www.unicode.org/Public/emoji/1.0/emoji-data.txt',
    },
  },
  {
    version: '2.0',
    files: {
      data: 'https://www.unicode.org/Public/emoji/2.0/emoji-data.txt',
      sequences: 'https://www.unicode.org/Public/emoji/2.0/emoji-sequences.txt',
      zwj: 'https://www.unicode.org/Public/emoji/2.0/emoji-zwj-sequences.txt',
    },
  },
  {
    version: '3.0',
    files: {
      data: 'https://www.unicode.org/Public/emoji/3.0/emoji-data.txt',
      sequences: 'https://www.unicode.org/Public/emoji/3.0/emoji-sequences.txt',
      zwj: 'https://www.unicode.org/Public/emoji/3.0/emoji-zwj-sequences.txt',
    },
  },
];

export const HISTORICAL_TEST_FILES = [
  { version: '4.0', url: 'https://www.unicode.org/Public/emoji/4.0/emoji-test.txt' },
  { version: '5.0', url: 'https://www.unicode.org/Public/emoji/5.0/emoji-test.txt' },
  { version: '11.0', url: 'https://www.unicode.org/Public/emoji/11.0/emoji-test.txt' },
  { version: '12.0', url: 'https://www.unicode.org/Public/emoji/12.0/emoji-test.txt' },
  { version: '12.1', url: 'https://www.unicode.org/Public/emoji/12.1/emoji-test.txt' },
  { version: '13.0', url: 'https://www.unicode.org/Public/emoji/13.0/emoji-test.txt' },
  { version: '13.1', url: 'https://www.unicode.org/Public/emoji/13.1/emoji-test.txt' },
  { version: '14.0', url: 'https://www.unicode.org/Public/emoji/14.0/emoji-test.txt' },
  { version: '15.0', url: 'https://www.unicode.org/Public/emoji/15.0/emoji-test.txt' },
  { version: '15.1', url: 'https://www.unicode.org/Public/emoji/15.1/emoji-test.txt' },
  { version: '16.0', url: 'https://www.unicode.org/Public/emoji/16.0/emoji-test.txt' },
  { version: '17.0', url: 'https://www.unicode.org/Public/17.0.0/emoji/emoji-test.txt' },
];
