// Cloudflare Pages Function: serves the About page from a single canonical
// URL, /about, choosing the styled HTML or the plain-markdown twin
// (dist/about.md) by the request's Accept header.
//
// Browsers always list text/html explicitly in Accept, so they keep getting
// the HTML page. A client that asks specifically for text/markdown — an AI
// agent, a fetch tool, a curl invocation someone wrote by hand for this
// purpose — gets the leaner markdown instead, without needing a different
// URL. Plain "*/*" (no explicit markdown token) also falls back to HTML,
// so an ordinary `curl https://emojisaurus.me/about` still shows the page.
//
// This file must live at the project root, alongside (not inside) dist/: it
// is Cloudflare Pages' file-based routing convention, deployed alongside the
// static output rather than as part of it. Test locally with:
//   npx wrangler pages dev dist

/** Parse an Accept header into {type, q} entries, default q = 1. */
export function parseAccept(acceptHeader) {
  return (acceptHeader || '')
    .split(',')
    .map((part) => {
      const [type, ...params] = part.trim().split(';');
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const q = qParam ? parseFloat(qParam.slice(2)) : 1;
      return { type: type.trim().toLowerCase(), q: Number.isNaN(q) ? 1 : q };
    })
    .filter((e) => e.type);
}

// The q-value Accept assigns a type, via exact match or a wildcard ("*/*").
function qFor(entries, type) {
  const exact = entries.find((e) => e.type === type);
  if (exact) return exact.q;
  const wildcard = entries.find((e) => e.type === '*/*');
  return wildcard ? wildcard.q : 0;
}

// True only when the client explicitly asked for text/markdown at a priority
// at least as high as text/html. A bare wildcard (no explicit markdown token)
// does not count — that keeps plain curl/no-Accept requests on HTML.
export function prefersMarkdown(acceptHeader) {
  const entries = parseAccept(acceptHeader);
  const markdown = entries.find((e) => e.type === 'text/markdown');
  if (!markdown) return false;
  return markdown.q >= qFor(entries, 'text/html');
}

export async function onRequestGet({ request, env }) {
  const wantsMarkdown = prefersMarkdown(request.headers.get('Accept'));

  const assetUrl = new URL(request.url);
  assetUrl.pathname = wantsMarkdown ? '/about.md' : '/about.html';
  const res = await env.ASSETS.fetch(new Request(assetUrl, request));
  if (!res.ok) return res;

  const headers = new Headers(res.headers);
  headers.set('Vary', 'Accept');
  if (wantsMarkdown) headers.set('Content-Type', 'text/markdown; charset=utf-8');
  return new Response(res.body, { status: res.status, headers });
}
