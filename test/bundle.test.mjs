import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { stripExports, stripImports, safeJson } from '../build/bundle.mjs';
import { buildIndex, search } from '../src/search.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(join(ROOT, 'dist', 'emoji17.html'), 'utf8');
const engineSrc = await readFile(join(ROOT, 'src', 'search.mjs'), 'utf8');
const appSrc = await readFile(join(ROOT, 'src', 'app.mjs'), 'utf8');
const dataset = JSON.parse(await readFile(join(ROOT, 'data', 'dataset.json'), 'utf8'));

// ---------------------------------------------------------------------------
// Transform correctness
// ---------------------------------------------------------------------------

test('stripExports removes only the export keyword', () => {
  const src = [
    'export const A = 1;',
    'export function f(){ return "export const x"; }',
    'export async function g(){}',
    'const B = 2;',
    'export { A, B };',
  ].join('\n');
  const out = stripExports(src);
  assert.ok(out.includes('const A = 1;'));
  assert.ok(out.includes('function f(){ return "export const x"; }'), 'string literals must survive');
  assert.ok(out.includes('async function g(){}'));
  assert.ok(out.includes('const B = 2;'));
  assert.ok(!/^export/m.test(out), 'no export statement should remain');
});

test('stripImports removes import statements including multi-line ones', () => {
  const src = "import a from 'x';\nimport {\n  b,\n  c,\n} from './y.mjs';\nconst z = 1;";
  const out = stripImports(src);
  assert.ok(!/^import/m.test(out));
  assert.ok(out.includes('const z = 1;'));
});

test('inlining does not interpret $-patterns in the payload', () => {
  // Regression guard: the engine contains `$&` inside a regex-escape call. If
  // the bundler uses a replacement *string* rather than a replacer function,
  // String.replace expands it into the matched text and corrupts the bundle.
  assert.ok(engineSrc.includes('$&'), 'the engine no longer contains a $-pattern; this guard needs a new fixture');
  assert.ok(html.includes("'\\\\$&'"), 'a $-pattern in the engine was expanded during inlining');
});

test('safeJson neutralises script-terminating and line-separator characters', () => {
  const s = safeJson({ a: '</script>', b: '  ' });
  assert.ok(!s.includes('</script>'));
  assert.ok(!s.includes(' '));
  assert.ok(!s.includes(' '));
  assert.deepEqual(JSON.parse(s), { a: '</script>', b: '  ' });
});

// ---------------------------------------------------------------------------
// One source of truth: the page cannot contain a different engine
// ---------------------------------------------------------------------------

function extractEngine(pageHtml) {
  const start = pageHtml.indexOf('/* ---- src/search.mjs');
  const end = pageHtml.indexOf('/* ---- src/app.mjs');
  assert.ok(start !== -1 && end !== -1 && end > start, 'engine markers missing from bundle');
  return pageHtml.slice(pageHtml.indexOf('\n', start) + 1, end);
}

test('the engine embedded in the page is the repository engine, verbatim', () => {
  const embedded = extractEngine(html).trimEnd();
  const expected = stripExports(engineSrc).trimEnd();
  assert.equal(embedded, expected, 'dist/emoji17.html is stale or hand-edited -- rerun the build');
});

test('the UI embedded in the page is the repository UI, verbatim', () => {
  const marker = '/* ---- src/app.mjs';
  const start = html.indexOf(marker);
  const embedded = html.slice(html.indexOf('\n', start) + 1, html.lastIndexOf('</script>')).trimEnd();
  assert.equal(embedded, stripImports(appSrc).trimEnd());
});

test('the page contains no network references', () => {
  // Self-contained means self-contained: no CDN, no fonts, no analytics.
  const body = html.replace(/https:\/\/(www\.)?unicode\.org[^\s"'<)]*/g, ''); // provenance URLs in data are fine
  assert.equal(/<script[^>]+src=/i.test(body), false, 'external script tag');
  assert.equal(/<link[^>]+rel=["']?stylesheet/i.test(body), false, 'external stylesheet');
  assert.equal(/@import\s/i.test(body), false, 'CSS @import');
  assert.equal(/\bfetch\s*\(/.test(body), false, 'runtime fetch call');
});

// ---------------------------------------------------------------------------
// Cross-surface equivalence: same query, same answer, both surfaces
// ---------------------------------------------------------------------------

/** Boot the page's own data + engine inside a VM, exactly as a browser would. */
function bootPageEngine() {
  const dataStart = html.indexOf('globalThis.__EMOJI_DATA__');
  const dataEnd = html.indexOf('</script>', dataStart);
  const dataScript = html.slice(dataStart, dataEnd);

  const context = vm.createContext({ TextEncoder, console });
  context.globalThis = context;
  vm.runInContext(dataScript, context);
  vm.runInContext(extractEngine(html), context);
  assert.ok(context.__EMOJI_DATA__, 'page data script did not execute');
  assert.ok(context.__EMOJI_DATA__.records[0].utf8Hex, 'hydration did not run');
  return context;
}

const page = bootPageEngine();

// Values produced inside the VM are cross-realm: their prototypes differ from
// this realm's, which deepStrictEqual treats as a mismatch. Round-tripping
// through JSON compares them structurally, which is what we actually mean.
const plain = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

test('the page payload hydrates to the same record shape as dataset.json', () => {
  const pageRecords = page.__EMOJI_DATA__.records;
  assert.equal(pageRecords.length, dataset.records.length);

  const nodeByBundleShape = new Map(dataset.records.map((r) => [r.id, r]));
  for (const pr of pageRecords) {
    const nr = nodeByBundleShape.get(pr.id);
    assert.ok(nr, `page has an id absent from the dataset: ${pr.id}`);
    for (const field of [
      'emoji', 'name', 'group', 'subgroup', 'status', 'version',
      'cpCount', 'utf8Bytes', 'utf16Units', 'kind', 'hasVS16',
      'toneCount', 'parentKey', 'parentId', 'order',
    ]) {
      assert.deepEqual(plain(pr[field]), nr[field], `${pr.emoji} field "${field}" differs between surfaces`);
    }
    for (const field of ['codePoints', 'keywords', 'tones', 'toneVariants', 'utf8Hex']) {
      assert.deepEqual(plain(pr[field]), nr[field], `${pr.emoji} array "${field}" differs between surfaces`);
    }
    assert.equal(pr.altUsages.length, nr.altUsages.length, `${pr.emoji} alt sense count differs`);
  }
});

test('utf8Hex rebuilt in the browser matches the build-time value byte for byte', () => {
  for (const pr of page.__EMOJI_DATA__.records) {
    const expected = [...Buffer.from(pr.emoji, 'utf8')].map((b) => b.toString(16).toUpperCase().padStart(2, '0'));
    assert.deepEqual(plain(pr.utf8Hex), expected, `client-side hex wrong for ${pr.emoji}`);
  }
});

const QUERIES = [
  '',
  'flag',
  'red flag',
  '"red flag"',
  'croissant',
  'croissnt',
  'name:fox',
  'kw:ocean',
  'alt:lying',
  'alt:betrayer',
  'reg:finance',
  'reg:misread',
  'bytes:>25',
  'bytes:4..7',
  'cps:1 bytes:3',
  'units:2',
  'v:17',
  'v:0.6',
  'cp:1F600',
  '1F1E6',
  'kind:zwj',
  'kind:tag-flag',
  'kind:keycap OR kind:flag',
  'group:food -name:cheese',
  'status:component',
  'tones:0 name:thumbs',
  '🚀',
  '🧑‍🚀',
  'zzzzqqqq',
];

test('every query returns identical results on both surfaces', () => {
  const nodeIndex = buildIndex(dataset.records);
  const pageIndex = page.buildIndex(page.__EMOJI_DATA__.records);

  for (const q of QUERIES) {
    for (const showExplicit of [false, true]) {
      for (const collapseTones of [true, false]) {
        const opts = { showExplicit, collapseTones };
        const a = search(nodeIndex, q, opts);
        const b = page.search(pageIndex, q, opts);

        const sig = (r) => r.results.map((x) => `${x.rec.id}:${x.score}:${x.fields.join('+')}`);
        assert.equal(b.total, a.total, `total differs for "${q}" (${JSON.stringify(opts)})`);
        assert.equal(b.usedFuzzy, a.usedFuzzy, `fuzzy flag differs for "${q}"`);
        assert.deepEqual(plain(sig(b)), sig(a), `result list differs for "${q}" (${JSON.stringify(opts)})`);
      }
    }
  }
});

test('the equivalence sweep actually exercised a meaningful number of rows', () => {
  const nodeIndex = buildIndex(dataset.records);
  const touched = QUERIES.reduce((n, q) => n + search(nodeIndex, q).total, 0);
  assert.ok(touched > 5000, `sweep only covered ${touched} result rows`);
});
