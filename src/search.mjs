// The query engine. One source of truth: the browser imports this file
// verbatim (inlined at bundle time) and so does the test suite, so there is no
// second implementation to drift.
//
// Query language
// --------------
//   croissant              free text across name, keywords and alternate senses
//   "red flag"             quoted phrase, matched as a unit
//   name:fox               scope a term to one field
//   kw:ocean               CLDR keyword
//   alt:lying              curated alternate sense
//   group:food             emoji group
//   sub:face-smiling       subgroup
//   v:17                   version added
//   cp:1F600               code point (hex, with or without U+)
//   kind:zwj               structural kind
//   status:component       qualification status
//   reg:finance            alternate-usage register
//   bytes:>8               numeric comparison  (> < >= <= =)
//   bytes:4..7             numeric range
//   cps:3                  code point count
//   units:2                UTF-16 unit count
//   tones:0                number of skin-tone modifiers
//   🚀                     paste an emoji to find it directly
//   -flag                  negate a term
//   fire OR water          alternation
//
// Terms are ANDed unless joined by OR. Negation binds to a single term.

export const NUMERIC_FIELDS = {
  bytes: 'utf8Bytes',
  cps: 'cpCount',
  units: 'utf16Units',
  tones: 'toneCount',
};

export const TEXT_FIELDS = {
  name: 'name',
  kw: 'keywords',
  alt: 'alt',
  group: 'group',
  sub: 'subgroup',
  v: 'version',
  cp: 'codePoints',
  kind: 'kind',
  status: 'status',
  reg: 'register',
};

const FIELD_ALIASES = {
  keyword: 'kw', keywords: 'kw',
  sense: 'alt', slang: 'alt', usage: 'alt',
  subgroup: 'sub', category: 'group', cat: 'group',
  version: 'v', ver: 'v',
  codepoint: 'cp', 'code-point': 'cp', hex: 'cp',
  byte: 'bytes', size: 'bytes',
  cpcount: 'cps', 'cp-count': 'cps',
  utf16: 'units',
  type: 'kind',
  register: 'reg',
  tone: 'tones',
};

// ---------------------------------------------------------------------------
// Tokenising
// ---------------------------------------------------------------------------

/** Split a raw query into tokens, honouring quoted phrases. */
export function tokenize(input) {
  const tokens = [];
  let i = 0;
  const s = String(input ?? '');

  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }

    let negated = false;
    if (ch === '-' && i + 1 < s.length && !/\s/.test(s[i + 1])) { negated = true; i++; }

    // field:value, where value may itself be quoted
    const rest = s.slice(i);
    const fieldMatch = /^([a-zA-Z][a-zA-Z0-9_-]*):/.exec(rest);
    let field = null;
    if (fieldMatch) {
      const raw = fieldMatch[1].toLowerCase();
      const resolved = FIELD_ALIASES[raw] ?? raw;
      if (resolved in TEXT_FIELDS || resolved in NUMERIC_FIELDS) {
        field = resolved;
        i += fieldMatch[0].length;
      }
    }

    let value;
    if (s[i] === '"') {
      const close = s.indexOf('"', i + 1);
      if (close === -1) { value = s.slice(i + 1); i = s.length; }
      else { value = s.slice(i + 1, close); i = close + 1; }
      tokens.push({ field, value, negated, phrase: true });
      continue;
    }

    let end = i;
    while (end < s.length && !/\s/.test(s[end])) end++;
    value = s.slice(i, end);
    i = end;
    if (!value) continue;

    if (!field && !negated && (value === 'OR' || value === 'or')) {
      tokens.push({ operator: 'OR' });
      continue;
    }
    tokens.push({ field, value, negated, phrase: false });
  }
  return tokens;
}

/** Group tokens into OR-separated clauses of ANDed terms. */
export function parseQuery(input) {
  const tokens = tokenize(input);
  const clauses = [[]];
  for (const t of tokens) {
    if (t.operator === 'OR') { clauses.push([]); continue; }
    clauses[clauses.length - 1].push(t);
  }
  return clauses.filter((c) => c.length > 0);
}

// ---------------------------------------------------------------------------
// Numeric predicates
// ---------------------------------------------------------------------------

export function parseNumericPredicate(value) {
  const v = String(value).trim();

  const range = /^(-?\d+)\.\.(-?\d+)$/.exec(v);
  if (range) {
    const lo = Number(range[1]);
    const hi = Number(range[2]);
    return (n) => n >= lo && n <= hi;
  }

  const cmp = /^(>=|<=|>|<|=)?\s*(-?\d+)$/.exec(v);
  if (cmp) {
    const op = cmp[1] ?? '=';
    const n = Number(cmp[2]);
    switch (op) {
      case '>': return (x) => x > n;
      case '<': return (x) => x < n;
      case '>=': return (x) => x >= n;
      case '<=': return (x) => x <= n;
      default: return (x) => x === n;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Fuzzy matching
// ---------------------------------------------------------------------------

/** Bounded Levenshtein: returns true when distance <= max. */
export function withinEditDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false;
  if (a === b) return true;

  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

// ---------------------------------------------------------------------------
// Index
// ---------------------------------------------------------------------------

const norm = (s) => String(s ?? '').toLowerCase();

/**
 * Precompute the lowercase haystacks each record is matched against, so the
 * per-keystroke path does no string allocation.
 */
export function buildIndex(records) {
  const senseView = (senses) => ({
    alt: [...senses.map((a) => a.sense), ...senses.map((a) => a.gloss ?? '')].map(norm),
    altSenses: senses.map((a) => norm(a.sense)),
    register: [...new Set(senses.map((a) => norm(a.register)))],
  });

  return records.map((rec) => {
    const base = {
      rec,
      name: norm(rec.name),
      nameWords: norm(rec.name).split(/[^a-z0-9]+/).filter(Boolean),
      keywords: rec.keywords.map(norm),
      group: norm(rec.group),
      subgroup: norm(rec.subgroup),
      version: norm(rec.version),
      codePoints: rec.codePoints.map((c) => norm(c.replace('U+', ''))),
      kind: norm(rec.kind),
      status: norm(rec.status),
      emoji: rec.emoji,
      hasExplicit: rec.altUsages.some((a) => a.explicit),
    };

    // Two prebuilt views of the same record. When the explicit gate is closed
    // the engine matches against `clean`, in which explicit senses simply do
    // not exist -- so there is no path by which one can leak, through any
    // field, scoped or free-text.
    const full = { ...base, ...senseView(rec.altUsages) };
    const clean = { ...base, ...senseView(rec.altUsages.filter((a) => !a.explicit)) };
    full.clean = clean;
    clean.clean = clean;
    return full;
  });
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const SCORE = {
  emojiExact: 1000,
  nameExact: 500,
  namePrefix: 300,
  nameWord: 220,
  nameWordPrefix: 180,
  altSense: 130,
  keyword: 110,
  keywordWordPrefix: 90,
  altGloss: 60,
  // A match landing in the middle of a word ("red" inside "lowered") is nearly
  // always noise. It still counts, so nothing is silently unfindable, but it
  // must not outrank a real word-boundary hit.
  nameSub: 25,
  keywordSub: 20,
  codePoint: 400,
  groupField: 80,
  fuzzy: 15,
};

/** Does any word in the haystack start with `value`? */
function hasWordPrefix(words, value) {
  return words.some((w) => w.startsWith(value));
}

// Word-boundary matching for free-text haystacks (alternate senses and
// glosses), so `alt:lying` does not match "imp*lying*". Regexes are cached by
// term because matchTerm runs once per record per term.
const WORD_RE_CACHE = new Map();

function wordBoundaryRe(value) {
  let re = WORD_RE_CACHE.get(value);
  if (!re) {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Bounded by a non-alphanumeric or the string edge on both sides. Written
    // out rather than using \b so it behaves for multi-word phrases too.
    re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`);
    if (WORD_RE_CACHE.size > 500) WORD_RE_CACHE.clear();
    WORD_RE_CACHE.set(value, re);
  }
  return re;
}

/** Does `value` appear as a whole word (or phrase) anywhere in the haystacks? */
function hasWholeWord(haystacks, value) {
  const re = wordBoundaryRe(value);
  return haystacks.some((h) => re.test(h));
}

/**
 * Score one term against one indexed record.
 * Returns { score, field } or null when the term does not match at all.
 */
export function matchTerm(entry, term, opts) {
  const { field, phrase } = term;
  const raw = String(term.value ?? '');
  const value = norm(raw);
  if (!value) return null;

  // ---- numeric fields ----
  if (field && field in NUMERIC_FIELDS) {
    const pred = parseNumericPredicate(raw);
    if (!pred) return null;
    return pred(entry.rec[NUMERIC_FIELDS[field]]) ? { score: 100, field } : null;
  }

  // ---- explicitly scoped text fields ----
  if (field && field in TEXT_FIELDS) {
    switch (field) {
      case 'name':
        return entry.name.includes(value) ? { score: entry.name === value ? SCORE.nameExact : SCORE.nameSub, field } : null;
      case 'kw':
        return entry.keywords.some((k) => k === value || k.includes(value)) ? { score: SCORE.keyword, field } : null;
      case 'alt': {
        // Sense labels rank above glosses, and whole-word matches above
        // mid-word ones, so `alt:lying` finds 🧢 ("lying") rather than any
        // gloss that happens to contain "implying".
        if (entry.altSenses.some((a) => a === value)) return { score: SCORE.altSense + 40, field };
        if (hasWholeWord(entry.altSenses, value)) return { score: SCORE.altSense, field };
        if (hasWholeWord(entry.alt, value)) return { score: SCORE.altGloss, field };
        // No mid-word fallback here on purpose: `alt:` is an explicit, precise
        // intent, so matching a fragment buried in unrelated prose is noise
        // rather than helpful recall. Free text still falls back, ranked last.
        return null;
      }
      case 'group':
        return entry.group.includes(value) ? { score: SCORE.groupField, field } : null;
      case 'sub':
        return entry.subgroup.includes(value) ? { score: SCORE.groupField, field } : null;
      case 'v':
        return entry.version === value || entry.version.startsWith(value + '.') ? { score: SCORE.groupField, field } : null;
      case 'cp': {
        const want = value.replace(/^u\+/, '').replace(/^0+/, '');
        return entry.codePoints.some((c) => c.replace(/^0+/, '') === want) ? { score: SCORE.codePoint, field } : null;
      }
      case 'kind':
        return entry.kind === value ? { score: SCORE.groupField, field } : null;
      case 'status':
        return entry.status.startsWith(value) ? { score: SCORE.groupField, field } : null;
      case 'reg':
        return entry.register.some((r) => r.includes(value)) ? { score: SCORE.groupField, field } : null;
      default:
        return null;
    }
  }

  // ---- free text ----

  // A pasted emoji matches its own record outright.
  if (raw && entry.emoji === raw) return { score: SCORE.emojiExact, field: 'emoji' };

  // A bare hex code point.
  if (/^(u\+)?[0-9a-f]{4,6}$/i.test(value)) {
    const want = value.replace(/^u\+/, '').replace(/^0+/, '');
    if (entry.codePoints.some((c) => c.replace(/^0+/, '') === want)) {
      return { score: SCORE.codePoint, field: 'codepoint' };
    }
  }

  if (entry.name === value) return { score: SCORE.nameExact, field: 'name' };
  if (entry.name.startsWith(value)) return { score: SCORE.namePrefix, field: 'name' };
  if (!phrase && entry.nameWords.some((w) => w === value)) return { score: SCORE.nameWord, field: 'name' };
  if (!phrase && hasWordPrefix(entry.nameWords, value)) return { score: SCORE.nameWordPrefix, field: 'name' };

  if (hasWholeWord(entry.altSenses, value)) return { score: SCORE.altSense, field: 'alt' };
  if (entry.keywords.some((k) => k === value)) return { score: SCORE.keyword, field: 'keyword' };
  if (entry.keywords.some((k) => k.split(/[^a-z0-9]+/).some((w) => w.startsWith(value)))) {
    return { score: SCORE.keywordWordPrefix, field: 'keyword' };
  }
  if (hasWholeWord(entry.alt, value)) return { score: SCORE.altGloss, field: 'alt' };
  if (entry.group.includes(value) || entry.subgroup.includes(value)) return { score: SCORE.groupField, field: 'group' };

  // Mid-word fallbacks last, so they only decide ties nothing better matched.
  if (entry.name.includes(value)) return { score: SCORE.nameSub, field: 'name' };
  if (entry.keywords.some((k) => k.includes(value))) return { score: SCORE.keywordSub, field: 'keyword' };
  if (entry.alt.some((a) => a.includes(value))) return { score: SCORE.keywordSub - 5, field: 'alt' };

  // ---- fuzzy fallback, only for terms long enough to be meaningful ----
  if (opts?.fuzzy !== false && value.length >= 4) {
    const max = value.length >= 8 ? 2 : 1;
    if (entry.nameWords.some((w) => withinEditDistance(w, value, max))) {
      return { score: SCORE.fuzzy, field: 'name~' };
    }
    if (entry.keywords.some((k) => withinEditDistance(k, value, max))) {
      return { score: SCORE.fuzzy - 5, field: 'keyword~' };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export const DEFAULT_OPTIONS = {
  statuses: ['fully-qualified'],
  showExplicit: false,
  collapseTones: true,
  fuzzy: true,
  limit: 0,
};

/**
 * Run a query against a prebuilt index.
 * Returns { results, total, parsed, usedFuzzy }.
 */
export function search(index, query, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const clauses = parseQuery(query);

  const statusSet = opts.statuses && opts.statuses.length ? new Set(opts.statuses) : null;
  // Explicitly asking for a status overrides the default status filter.
  const queryPinsStatus = clauses.some((c) => c.some((t) => t.field === 'status' && !t.negated));

  const scored = [];
  let usedFuzzy = false;

  for (const full of index) {
    if (statusSet && !queryPinsStatus && !statusSet.has(full.rec.status)) continue;
    if (opts.collapseTones && full.rec.parentKey) continue;

    // Closed gate: match against the view with explicit senses removed.
    const entry = opts.showExplicit ? full : full.clean;

    let best = null;

    if (clauses.length === 0) {
      best = { score: 0, fields: [] };
    } else {
      for (const clause of clauses) {
        let total = 0;
        const fields = [];
        let ok = true;
        let clauseFuzzy = false;

        for (const term of clause) {
          const m = matchTerm(entry, term, { fuzzy: opts.fuzzy });
          if (term.negated) {
            if (m) { ok = false; break; }
            continue;
          }
          if (!m) { ok = false; break; }
          total += m.score;
          if (m.field.endsWith('~')) clauseFuzzy = true;
          if (!fields.includes(m.field)) fields.push(m.field);
        }

        if (ok && (best === null || total > best.score)) {
          best = { score: total, fields };
          if (clauseFuzzy) usedFuzzy = true;
        }
      }
    }

    if (!best) continue;

    scored.push({ rec: entry.rec, score: best.score, fields: best.fields });
  }

  // Stable ordering: score first, then CLDR order so equal scores stay in the
  // sequence Unicode intends for keyboard palettes.
  scored.sort((a, b) => (b.score - a.score) || (a.rec.order - b.rec.order));

  const total = scored.length;
  const results = opts.limit > 0 ? scored.slice(0, opts.limit) : scored;
  return { results, total, parsed: clauses, usedFuzzy };
}

/** Filter an emoji's senses for display according to the explicit toggle. */
export function visibleSenses(rec, showExplicit) {
  return showExplicit ? rec.altUsages : rec.altUsages.filter((a) => !a.explicit);
}
