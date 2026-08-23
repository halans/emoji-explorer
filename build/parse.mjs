// Parsers for every upstream format. Pure functions, no I/O, so the test suite
// can exercise them against fixtures.

export const VS16 = 0xfe0f;
export const ZWJ = 0x200d;
export const TONE_MIN = 0x1f3fb;
export const TONE_MAX = 0x1f3ff;
export const TAG_MIN = 0xe0020;
export const TAG_MAX = 0xe007f;
export const REGIONAL_MIN = 0x1f1e6;
export const REGIONAL_MAX = 0x1f1ff;

/** Code point array -> stable comparison key with VS16 stripped. */
export function normKey(codePoints) {
  return codePoints
    .filter((cp) => cp !== VS16)
    .map((cp) => cp.toString(16).toUpperCase().padStart(4, '0'))
    .join('-');
}

/** String -> code point array. */
export function toCodePoints(str) {
  return [...str].map((ch) => ch.codePointAt(0));
}

/** Code point array -> string. */
export function fromCodePoints(cps) {
  return String.fromCodePoint(...cps);
}

/** "1F468 200D 1F469" -> [0x1F468, 0x200D, 0x1F469] */
export function parseHexSequence(text) {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((h) => parseInt(h, 16));
}

function stripComment(line) {
  const hash = line.indexOf('#');
  return hash === -1 ? line : line.slice(0, hash);
}

/**
 * emoji-test.txt
 * Format: code points ; status # emoji name
 * Group/subgroup come from "# group:" / "# subgroup:" marker comments.
 */
export function parseEmojiTest(text) {
  const rows = [];
  let group = null;
  let subgroup = null;
  let order = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('#')) {
      const g = /^#\s*group:\s*(.+)$/.exec(line);
      if (g) { group = g[1].trim(); subgroup = null; continue; }
      const s = /^#\s*subgroup:\s*(.+)$/.exec(line);
      if (s) { subgroup = s[1].trim(); continue; }
      continue;
    }

    // 1F600  ; fully-qualified  # 😀 E1.0 grinning face
    const m = /^([0-9A-Fa-f\s]+);\s*([a-z-]+)\s*#\s*(\S+)\s+(.*)$/.exec(line);
    if (!m) continue;

    const codePoints = parseHexSequence(m[1]);
    const status = m[2];
    const glyph = m[3];

    // The trailing comment is "E<version> <name>" in modern files and just
    // "<name>" in Emoji 4.0/5.0. Capture the declared version when present.
    let rest = m[4].trim();
    let declaredVersion = null;
    const v = /^E(\d+(?:\.\d+)?)\s+(.*)$/.exec(rest);
    if (v) { declaredVersion = v[1]; rest = v[2].trim(); }

    rows.push({
      codePoints,
      key: normKey(codePoints),
      status,
      glyph,
      name: rest,
      group,
      subgroup,
      declaredVersion,
      order: order++,
    });
  }
  return rows;
}

/**
 * emoji-data.txt in any era, plus emoji-sequences.txt / emoji-zwj-sequences.txt.
 * All share "field1 ; field2 ..." with field1 being either a single code point,
 * a `X..Y` range, or a space-separated sequence. We only need the key set.
 */
export function parseKeySet(text) {
  const keys = new Set();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripComment(rawLine).trim();
    if (!line) continue;
    const field = line.split(';')[0].trim();
    if (!field) continue;

    const range = /^([0-9A-Fa-f]+)\.\.([0-9A-Fa-f]+)$/.exec(field);
    if (range) {
      const lo = parseInt(range[1], 16);
      const hi = parseInt(range[2], 16);
      for (let cp = lo; cp <= hi; cp++) keys.add(normKey([cp]));
      continue;
    }
    if (!/^[0-9A-Fa-f\s]+$/.test(field)) continue;
    const cps = parseHexSequence(field);
    if (cps.length && cps.every((cp) => Number.isFinite(cp))) keys.add(normKey(cps));
  }
  return keys;
}

/**
 * emoji-sequences.txt property field, used to classify sequence kind.
 * Returns Map<key, propertyName>.
 */
export function parseSequenceProperties(text) {
  const out = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripComment(rawLine).trim();
    if (!line) continue;
    const parts = line.split(';');
    if (parts.length < 2) continue;
    const field = parts[0].trim();
    const prop = parts[1].trim();
    if (!/^[0-9A-Fa-f\s.]+$/.test(field)) continue;

    const range = /^([0-9A-Fa-f]+)\.\.([0-9A-Fa-f]+)$/.exec(field);
    if (range) {
      const lo = parseInt(range[1], 16);
      const hi = parseInt(range[2], 16);
      for (let cp = lo; cp <= hi; cp++) out.set(normKey([cp]), prop);
      continue;
    }
    out.set(normKey(parseHexSequence(field)), prop);
  }
  return out;
}

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeXml(s) {
  return s.replace(/&(?:#(\d+)|#x([0-9a-fA-F]+)|(\w+));/g, (full, dec, hex, name) => {
    if (dec) return String.fromCodePoint(Number(dec));
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    return XML_ENTITIES[name] ?? full;
  });
}

/**
 * CLDR annotations XML.
 * <annotation cp="😀">face | grin</annotation>
 * <annotation cp="😀" type="tts">grinning face</annotation>
 * Returns Map<key, { keywords: string[], tts: string|null }>.
 */
export function parseCldrAnnotations(xml) {
  const out = new Map();
  const re = /<annotation\s+cp="([^"]*)"([^>]*)>([\s\S]*?)<\/annotation>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const cp = decodeXml(m[1]);
    const attrs = m[2];
    const body = decodeXml(m[3]).trim();
    const key = normKey(toCodePoints(cp));
    if (!out.has(key)) out.set(key, { keywords: [], tts: null });
    const entry = out.get(key);
    if (/type="tts"/.test(attrs)) {
      entry.tts = body;
    } else {
      for (const kw of body.split('|').map((s) => s.trim()).filter(Boolean)) {
        if (!entry.keywords.includes(kw)) entry.keywords.push(kw);
      }
    }
  }
  return out;
}

/** Classify a sequence structurally from its code points. */
export function classifySequence(cps) {
  const bare = cps.filter((cp) => cp !== VS16);
  if (bare.some((cp) => cp >= TAG_MIN && cp <= TAG_MAX)) return 'tag-flag';
  if (bare.length === 2 && bare.every((cp) => cp >= REGIONAL_MIN && cp <= REGIONAL_MAX)) return 'flag';
  if (bare.includes(0x20e3)) return 'keycap';
  if (bare.includes(ZWJ)) return 'zwj';
  if (bare.some((cp) => cp >= TONE_MIN && cp <= TONE_MAX)) return 'modifier';
  if (bare.length > 1) return 'sequence';
  return 'single';
}

/** Skin-tone modifiers present, in order. */
export function toneModifiers(cps) {
  return cps.filter((cp) => cp >= TONE_MIN && cp <= TONE_MAX);
}

/** Remove skin-tone modifiers to find the tone-neutral parent form. */
export function stripTones(cps) {
  return cps.filter((cp) => !(cp >= TONE_MIN && cp <= TONE_MAX));
}

export const TONE_NAMES = {
  0x1f3fb: 'light',
  0x1f3fc: 'medium-light',
  0x1f3fd: 'medium',
  0x1f3fe: 'medium-dark',
  0x1f3ff: 'dark',
};
