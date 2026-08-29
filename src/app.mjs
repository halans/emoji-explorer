// UI layer. Imports the shared engine; contains no matching logic of its own.
import { buildIndex, search, visibleSenses, TEXT_FIELDS, NUMERIC_FIELDS } from './search.mjs';

const DATA = globalThis.__EMOJI_DATA__;
const records = DATA.records;
const index = buildIndex(records);
const byId = new Map(records.map((r) => [r.id, r]));

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const state = {
  query: '',
  showExplicit: false,
  collapseTones: true,
  status: 'fully-qualified',
  sort: 'relevance',
  dir: 'asc',
  selected: null,
  results: [],
  total: 0,
  usedFuzzy: false,
};

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

const SORTS = {
  relevance: null,
  emoji: (a, b) => a.rec.name.localeCompare(b.rec.name),
  name: (a, b) => a.rec.name.localeCompare(b.rec.name),
  group: (a, b) => a.rec.group.localeCompare(b.rec.group) || a.rec.order - b.rec.order,
  cps: (a, b) => a.rec.cpCount - b.rec.cpCount || a.rec.order - b.rec.order,
  bytes: (a, b) => a.rec.utf8Bytes - b.rec.utf8Bytes || a.rec.order - b.rec.order,
  units: (a, b) => a.rec.utf16Units - b.rec.utf16Units || a.rec.order - b.rec.order,
  version: (a, b) => parseFloat(a.rec.version) - parseFloat(b.rec.version) || a.rec.order - b.rec.order,
};

// ---------------------------------------------------------------------------
// Query execution
// ---------------------------------------------------------------------------

function execute() {
  const t0 = performance.now();
  const out = search(index, state.query, {
    statuses: state.status === 'all' ? [] : [state.status],
    showExplicit: state.showExplicit,
    collapseTones: state.collapseTones,
  });
  let results = out.results;

  const cmp = SORTS[state.sort];
  if (cmp) {
    results = results.slice().sort(cmp);
    if (state.dir === 'desc') results.reverse();
  }

  state.results = results;
  state.total = out.total;
  state.usedFuzzy = out.usedFuzzy;
  state.elapsed = performance.now() - t0;

  renderStatus();
  renderTable();
}

// ---------------------------------------------------------------------------
// Virtualised table
// ---------------------------------------------------------------------------

// Mobile renders the same results as cards rather than grid rows: the desktop
// column grid needs ~430px minimum and clipped every row on a 390px screen.
// Both shapes are fixed-height, so the virtualiser is unchanged either way.
const MOBILE_Q = '(max-width: 820px)';
const mobileMQ = typeof matchMedia === 'function' ? matchMedia(MOBILE_Q) : null;
const isMobile = () => Boolean(mobileMQ && mobileMQ.matches);

const ROW_H_DESKTOP = 44;
const ROW_H_MOBILE = 76;
const rowHeight = () => (isMobile() ? ROW_H_MOBILE : ROW_H_DESKTOP);

const OVERSCAN = 8;
let viewport, spacer, rowLayer;

function renderTable() {
  spacer.style.height = state.results.length * rowHeight() + 'px';
  paintRows();
}

function paintRows() {
  const h = rowHeight();
  const scrollTop = viewport.scrollTop;
  const height = viewport.clientHeight;
  const first = Math.max(0, Math.floor(scrollTop / h) - OVERSCAN);
  const last = Math.min(state.results.length, Math.ceil((scrollTop + height) / h) + OVERSCAN);

  rowLayer.textContent = '';
  rowLayer.style.transform = `translateY(${first * h}px)`;

  const build = isMobile() ? buildCard : buildRow;
  for (let i = first; i < last; i++) {
    rowLayer.appendChild(build(state.results[i], i));
  }
}

/** Mobile row: glyph, name, and a compact metric strip. No column grid. */
function buildCard(result) {
  const rec = result.rec;
  const row = el('div', 'row' + (state.selected === rec.id ? ' sel' : ''));
  row.dataset.id = rec.id;
  row.style.height = ROW_H_MOBILE + 'px';

  const g = el('div', 'c-emoji');
  g.appendChild(el('span', 'glyph', rec.emoji));
  row.appendChild(g);

  const body = el('div', 'c-name');
  body.appendChild(el('span', 'nm', rec.name));

  const meta = el('div', 'm-meta');
  const stat = (cls, n, unit) => {
    const s = el('span', cls);
    s.appendChild(el('b', null, String(n)));
    s.appendChild(document.createTextNode(' ' + unit));
    return s;
  };
  meta.appendChild(stat('m-bytes', rec.utf8Bytes, 'B'));
  meta.appendChild(stat('m-cps', rec.cpCount, 'cp'));
  meta.appendChild(stat('m-units', rec.utf16Units, 'u16'));
  meta.appendChild(el('span', 'm-sub', 'E' + rec.version));

  const senses = visibleSenses(rec, state.showExplicit);
  if (senses.length) {
    meta.appendChild(el('span', 'alt-badge', senses.length === 1 ? senses[0].sense : `${senses.length} senses`));
  }
  if (rec.toneVariants.length && state.collapseTones) {
    meta.appendChild(el('span', 'tone-badge', `+${rec.toneVariants.length}`));
  }
  body.appendChild(meta);
  row.appendChild(body);

  row.appendChild(el('div', 'm-chev', '›'));
  row.addEventListener('click', () => selectRow(rec.id));
  return row;
}

function buildRow(result, i) {
  const rec = result.rec;
  const row = el('div', 'row' + (state.selected === rec.id ? ' sel' : ''));
  row.dataset.id = rec.id;
  row.style.height = ROW_H_DESKTOP + 'px';

  row.appendChild(el('div', 'c-idx', String(i + 1)));

  const g = el('div', 'c-emoji');
  g.appendChild(el('span', 'glyph', rec.emoji));
  row.appendChild(g);

  const nameCell = el('div', 'c-name');
  nameCell.appendChild(el('span', 'nm', rec.name));
  const senses = visibleSenses(rec, state.showExplicit);
  if (senses.length) {
    const tag = el('span', 'alt-badge', senses.length === 1 ? senses[0].sense : `${senses.length} alt senses`);
    tag.title = senses.map((s) => `${s.register}: ${s.sense}`).join('\n');
    nameCell.appendChild(tag);
  }
  if (rec.toneVariants.length && state.collapseTones) {
    nameCell.appendChild(el('span', 'tone-badge', `+${rec.toneVariants.length}`));
  }
  row.appendChild(nameCell);

  row.appendChild(el('div', 'c-group', rec.subgroup));
  row.appendChild(el('div', 'c-num', String(rec.cpCount)));

  const bytes = el('div', 'c-num bytes');
  bytes.appendChild(el('span', 'bnum', String(rec.utf8Bytes)));
  const bar = el('span', 'bbar');
  bar.style.width = Math.min(100, (rec.utf8Bytes / 35) * 100) + '%';
  bytes.appendChild(bar);
  row.appendChild(bytes);

  row.appendChild(el('div', 'c-num', String(rec.utf16Units)));
  row.appendChild(el('div', 'c-ver', 'E' + rec.version));
  row.appendChild(el('div', 'c-cp', rec.codePoints.join(' ')));

  row.addEventListener('click', () => selectRow(rec.id));
  return row;
}

function selectRow(id) {
  state.selected = id;
  paintRows();
  renderDetail(byId.get(id));
  if (isMobile()) openSheet();
}

// ---------------------------------------------------------------------------
// Bottom sheet (mobile only)
// ---------------------------------------------------------------------------

function openSheet() {
  $('#detail').classList.add('open');
  $('#scrim').hidden = false;
  requestAnimationFrame(() => $('#scrim').classList.add('open'));
  $('#sheetClose').focus({ preventScroll: true });
}

function closeSheet() {
  $('#detail').classList.remove('open');
  $('#scrim').classList.remove('open');
  setTimeout(() => { if (!$('#detail').classList.contains('open')) $('#scrim').hidden = true; }, 250);
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

function copyable(label, value) {
  const wrap = el('div', 'kv');
  wrap.appendChild(el('div', 'k', label));
  const v = el('div', 'v mono');
  v.appendChild(el('span', null, value));
  const btn = el('button', 'copy', 'copy');
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      btn.textContent = 'copied';
      setTimeout(() => { btn.textContent = 'copy'; }, 1200);
    } catch {
      btn.textContent = 'blocked';
      setTimeout(() => { btn.textContent = 'copy'; }, 1200);
    }
  });
  v.appendChild(btn);
  wrap.appendChild(v);
  return wrap;
}

function renderDetail(rec) {
  // Content goes in #detailBody, not #detail — the sheet's close button is a
  // sibling that must survive re-render.
  const panel = $('#detailBody');
  panel.textContent = '';
  if (!rec) {
    panel.appendChild(el('div', 'empty', 'Select a row to inspect its encoding, keywords and alternate senses.'));
    return;
  }

  const head = el('div', 'd-head');
  head.appendChild(el('div', 'd-glyph', rec.emoji));
  const ht = el('div', 'd-ht');
  ht.appendChild(el('div', 'd-name', rec.name));
  ht.appendChild(el('div', 'd-sub', `${rec.group} › ${rec.subgroup}`));
  const chips = el('div', 'd-chips');
  chips.appendChild(el('span', 'chip', 'E' + rec.version));
  chips.appendChild(el('span', 'chip', rec.kind));
  chips.appendChild(el('span', 'chip', rec.status));
  if (rec.hasVS16) chips.appendChild(el('span', 'chip', 'VS16'));
  ht.appendChild(chips);
  head.appendChild(ht);
  panel.appendChild(head);

  // Size summary
  const sizes = el('div', 'sizes');
  const sz = (n, l) => {
    const b = el('div', 'sz');
    b.appendChild(el('div', 'szn', String(n)));
    b.appendChild(el('div', 'szl', l));
    return b;
  };
  const plural = (n, word) => (n === 1 ? word : word + 's');
  sizes.appendChild(sz(rec.cpCount, plural(rec.cpCount, 'code point')));
  sizes.appendChild(sz(rec.utf8Bytes, plural(rec.utf8Bytes, 'UTF-8 byte')));
  sizes.appendChild(sz(rec.utf16Units, plural(rec.utf16Units, 'UTF-16 unit')));
  sizes.appendChild(sz(rec.utf8Bytes * 8, 'bits'));
  panel.appendChild(sizes);

  // Encoding breakdown
  panel.appendChild(el('h3', null, 'Encoding'));
  const cps = rec.codePoints;
  panel.appendChild(copyable('Code points', cps.join(' ')));
  panel.appendChild(copyable('UTF-8 bytes', rec.utf8Hex.map((h) => '0x' + h).join(' ')));
  panel.appendChild(copyable('HTML entities', cps.map((c) => '&#x' + c.slice(2) + ';').join('')));
  panel.appendChild(copyable('JS escape', cps.map((c) => '\\u{' + c.slice(2) + '}').join('')));
  panel.appendChild(copyable('CSS content', cps.map((c) => '\\' + c.slice(2)).join(' ')));
  panel.appendChild(copyable('Percent-encoded', rec.utf8Hex.map((h) => '%' + h).join('')));
  panel.appendChild(copyable('Python', cps.map((c) => '\\U' + c.slice(2).padStart(8, '0')).join('')));
  panel.appendChild(copyable('Glyph', rec.emoji));

  // Byte-by-byte
  const bytesRow = el('div', 'bytegrid');
  for (const h of rec.utf8Hex) {
    const b = el('div', 'byte');
    b.appendChild(el('div', 'bh', h));
    b.appendChild(el('div', 'bb', parseInt(h, 16).toString(2).padStart(8, '0')));
    bytesRow.appendChild(b);
  }
  panel.appendChild(el('h3', null, `UTF-8, byte by byte (${rec.utf8Bytes})`));
  panel.appendChild(bytesRow);

  // Alternate senses
  const senses = visibleSenses(rec, state.showExplicit);
  const hiddenCount = rec.altUsages.length - senses.length;
  panel.appendChild(el('h3', null, 'Alternate usages'));
  if (senses.length === 0 && hiddenCount === 0) {
    panel.appendChild(el('div', 'muted', 'No curated alternate sense recorded for this emoji.'));
  }
  for (const s of senses) {
    const card = el('div', 'sense');
    const top = el('div', 'sense-top');
    top.appendChild(el('span', 'reg reg-' + s.register, s.register));
    top.appendChild(el('span', 'sense-name', s.sense));
    top.appendChild(el('span', 'conf conf-' + s.confidence, s.confidence));
    if (s.combo) top.appendChild(el('span', 'combo', 'as ' + s.combo));
    card.appendChild(top);
    card.appendChild(el('div', 'gloss', s.gloss));
    panel.appendChild(card);
  }
  if (hiddenCount > 0) {
    const warn = el('div', 'muted gated');
    warn.textContent = `${hiddenCount} explicit sense${hiddenCount === 1 ? '' : 's'} hidden. `;
    const a = el('button', 'linkbtn', 'Show explicit senses');
    a.addEventListener('click', () => { $('#explicit').checked = true; state.showExplicit = true; execute(); renderDetail(rec); });
    warn.appendChild(a);
    panel.appendChild(warn);
  }

  // CLDR keywords
  panel.appendChild(el('h3', null, `CLDR keywords (${rec.keywords.length})`));
  const kws = el('div', 'kws');
  for (const k of rec.keywords) {
    const b = el('button', 'kw', k);
    b.addEventListener('click', () => { setQuery(`kw:${/\s/.test(k) ? '"' + k + '"' : k}`); });
    kws.appendChild(b);
  }
  panel.appendChild(kws);

  // Tone family
  if (rec.toneVariants.length) {
    panel.appendChild(el('h3', null, `Skin-tone family (${rec.toneVariants.length})`));
    const fam = el('div', 'family');
    for (const id of rec.toneVariants) {
      const child = byId.get(id);
      if (!child) continue;
      const b = el('button', 'famitem');
      b.appendChild(el('span', 'famglyph', child.emoji));
      b.appendChild(el('span', 'famlabel', `${child.tones.join(', ')} · ${child.utf8Bytes}B`));
      b.addEventListener('click', () => {
        state.collapseTones = false;
        $('#collapse').checked = false;
        execute();
        selectRow(id);
      });
      fam.appendChild(b);
    }
    panel.appendChild(fam);
  }
  if (rec.parentId) {
    const p = byId.get(rec.parentId);
    if (p) {
      panel.appendChild(el('h3', null, 'Tone-neutral form'));
      const b = el('button', 'famitem');
      b.appendChild(el('span', 'famglyph', p.emoji));
      b.appendChild(el('span', 'famlabel', `${p.name} · ${p.utf8Bytes}B`));
      b.addEventListener('click', () => selectRow(p.id));
      panel.appendChild(b);
    }
  }

  panel.scrollTop = 0;
  $('#detail').scrollTop = 0;
}

// ---------------------------------------------------------------------------
// Status line
// ---------------------------------------------------------------------------

function renderStatus() {
  const s = $('#status');
  s.textContent = '';
  s.appendChild(el('strong', null, state.total.toLocaleString()));
  s.appendChild(el('span', null, ` of ${records.filter((r) => state.status === 'all' || r.status === state.status).length.toLocaleString()} rows`));
  s.appendChild(el('span', 'dot', '·'));
  s.appendChild(el('span', null, `${state.elapsed.toFixed(1)} ms`));
  if (state.usedFuzzy) {
    s.appendChild(el('span', 'dot', '·'));
    s.appendChild(el('span', 'fuzzy', 'fuzzy fallback'));
  }
  if (state.collapseTones) {
    s.appendChild(el('span', 'dot', '·'));
    s.appendChild(el('span', 'muted-i', 'tone variants collapsed'));
  }
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function setQuery(q) {
  state.query = q;
  $('#q').value = q;
  execute();
}

const EXAMPLES = [
  ['bytes:>25', 'the heaviest sequences'],
  ['cps:1 bytes:3', 'single code point, 3 bytes'],
  ['v:17', 'new in Emoji 17.0'],
  ['alt:lying', 'searched by slang sense'],
  ['reg:finance', 'the trading-desk register'],
  ['reg:misread', 'names nobody recognises'],
  ['kind:tag-flag', 'tag sequences'],
  ['croissnt', 'typo tolerance'],
  ['group:food -name:cheese', 'boolean negation'],
  ['kw:ocean OR kw:space', 'alternation'],
];

function boot() {
  viewport = $('#viewport');
  spacer = $('#spacer');
  rowLayer = $('#rows');

  $('#q').addEventListener('input', (e) => { state.query = e.target.value; execute(); });
  $('#explicit').addEventListener('change', (e) => { state.showExplicit = e.target.checked; execute(); if (state.selected) renderDetail(byId.get(state.selected)); });
  $('#collapse').addEventListener('change', (e) => { state.collapseTones = e.target.checked; execute(); });
  $('#statusSel').addEventListener('change', (e) => { state.status = e.target.value; execute(); });

  viewport.addEventListener('scroll', paintRows, { passive: true });
  window.addEventListener('resize', paintRows);

  document.querySelectorAll('[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (state.sort === key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
      else { state.sort = key; state.dir = 'asc'; }
      document.querySelectorAll('[data-sort]').forEach((o) => o.classList.remove('asc', 'desc'));
      if (key !== 'relevance') th.classList.add(state.dir);
      // Keep the mobile control in step, so crossing the breakpoint is not
      // confusing.
      const sel = $('#sortSel');
      if (sel && [...sel.options].some((o) => o.value === state.sort)) sel.value = state.sort;
      $('#dirBtn').textContent = state.dir === 'asc' ? '↑' : '↓';
      execute();
    });
  });

  const ex = $('#examples');
  for (const [q, label] of EXAMPLES) {
    const b = el('button', 'ex');
    b.appendChild(el('code', null, q));
    b.appendChild(el('span', null, label));
    b.addEventListener('click', () => setQuery(q));
    ex.appendChild(b);
  }

  // Field reference
  const ref = $('#fieldref');
  for (const f of [...Object.keys(TEXT_FIELDS), ...Object.keys(NUMERIC_FIELDS)]) {
    const b = el('button', 'fieldchip', f + ':');
    b.addEventListener('click', () => {
      const q = ($('#q').value + ' ' + f + ':').trimStart();
      state.query = q;
      $('#q').value = q;
      $('#q').focus();
    });
    ref.appendChild(b);
  }

  // ---- mobile-only controls ----
  // The disclosure, the sort select and the sheet exist in the DOM at every
  // width; CSS hides them on desktop, so this wiring is harmless there.
  $('#helpToggle').addEventListener('click', () => {
    const btn = $('#helpToggle');
    const open = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!open));
    $('#queryhelp').classList.toggle('open', !open);
  });

  const sortSel = $('#sortSel');
  sortSel.addEventListener('change', () => { state.sort = sortSel.value; execute(); });
  $('#dirBtn').addEventListener('click', () => {
    state.dir = state.dir === 'asc' ? 'desc' : 'asc';
    $('#dirBtn').textContent = state.dir === 'asc' ? '↑' : '↓';
    execute();
  });

  $('#sheetClose').addEventListener('click', closeSheet);
  $('#scrim').addEventListener('click', closeSheet);

  // Switching orientation or resizing across the breakpoint changes row height
  // and row shape, so the virtualiser has to be told to redraw.
  const onBreakpoint = () => {
    if (!isMobile()) closeSheet();
    renderTable();
    renderStatus();
  };
  if (mobileMQ) {
    if (mobileMQ.addEventListener) mobileMQ.addEventListener('change', onBreakpoint);
    else if (mobileMQ.addListener) mobileMQ.addListener(onBreakpoint);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== $('#q')) { e.preventDefault(); $('#q').focus(); }
    if (e.key === 'Escape') {
      if ($('#detail').classList.contains('open')) { closeSheet(); return; }
      $('#q').blur();
    }
  });

  $('#meta').textContent = `Emoji ${DATA.meta.emojiVersion} · ${DATA.meta.totals.byStatus['fully-qualified'].toLocaleString()} fully-qualified · ${DATA.meta.altUsageSenses} curated senses across ${Object.keys(DATA.meta.altRegisters).length} registers`;

  // Deep link: ?q=<query>. This is how the landing page's examples work, and
  // how anyone else can link to a specific search.
  try {
    const initial = new URLSearchParams(location.search).get('q');
    if (initial) {
      state.query = initial;
      $('#q').value = initial;
    }
  } catch {
    // A malformed URL must never stop the app booting.
  }

  execute();
  renderDetail(null);
}

boot();
