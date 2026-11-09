// Security fuzz: injects hostile strings into every text and URL field of the content and
// finance data, renders every page, and fails if anything executable survives escaping.
await import('../src/lib.js');
await import('../src/render.js');
const { loadData, sampleData } = await import('./build.mjs');

const PROBES = [
  '"><xss-probe onerror=alert(1)>',
  "'><xss-probe onmouseover=alert(1)>",
  '</script><xss-probe>',
  '<svg onload=alert(1)>',
  '{{constructor.constructor("alert(1)")()}}',
  '${alert(1)}',
  '  <xss-probe>',
];
const BAD_URLS = ['javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'data:text/html,<xss-probe>', 'vbscript:msgbox(1)', '//evil.example/x', 'http://evil.example/x', 'java\tscript:alert(1)', '\\\\evil.example\\x'];
const URLISH = /(url|href|src|link|facebook|website)$/i;

function walk(v, key, fn) {
  if (typeof v === 'string') return fn(v, key);
  if (Array.isArray(v)) return v.map((x) => walk(x, key, fn));
  if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = walk(x, k, fn); return o; }
  return v;
}
const ROUTES = ['home', 'masjid', 'progress', 'about', 'transparency', 'donate', 'privacy', 'policy', 'status'];

function scan(html, label) {
  const problems = [];
  // Inline JSON blocks are data, not markup: drop them (they are <-escaped) before scanning markup.
  const markup = html.replace(/<script type="application\/json"[^>]*>[\s\S]*?<\/script>/g, (m) => {
    if (/<(?!\/script>$)/.test(m.slice(m.indexOf('>') + 1, -9))) problems.push('unescaped < inside JSON block');
    return '';
  });
  if (/<xss-probe/i.test(markup)) problems.push('raw <xss-probe> tag');
  if (/<svg onload/i.test(markup)) problems.push('raw <svg onload>');
  // Inspect real tags only (escaped text such as &lt;xss-probe&gt; is harmless).
  for (const tag of markup.match(/<[a-z][a-z0-9-]*\b[^>]*>/gi) || []) {
    const attrs = tag.replace(/"[^"]*"|'[^']*'/g, (q) => q.replace(/\s/g, '_')); // collapse quoted values
    if (/\son[a-z]+\s*=/i.test(attrs)) problems.push('event-handler attribute: ' + tag.slice(0, 80));
    for (const m of tag.matchAll(/\s(href|src|srcset|action|formaction)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
      const val = (m[3] ?? m[4] ?? m[5] ?? '').replace(/&#x?[0-9a-f]+;?/gi, '').replace(/[\s\u0000-\u001f]/g, '').toLowerCase();
      if (/^(javascript|vbscript|data:text)/.test(val)) problems.push('dangerous URL: ' + tag.slice(0, 80));
      if (/^(\/\/|http:|\\)/.test(val)) problems.push('off-site/http URL: ' + tag.slice(0, 80));
    }
  }
  if (/<script(?![^>]*application\/json)[^>]*>/i.test(markup)) problems.push('executable <script> in rendered body');
  return problems.map((p) => `${label}: ${p}`);
}

const base = sampleData(loadData());
const failures = [];
let renders = 0;
for (const probe of PROBES) {
  const data = { content: walk(base.content, '', (s, k) => (URLISH.test(k) ? s : s + probe)), finance: walk(base.finance, '', (s, k) => (URLISH.test(k) ? s : s + probe)) };
  for (const r of ROUTES) for (const target of ['dist', 'preview']) {
    let html;
    try { html = MW.renderBody(data, { target, preview: target === 'preview', currentRoute: r }).html; } catch (e) { failures.push(`${probe} ${r}: render threw ${e.message}`); continue; }
    renders++; failures.push(...scan(html, `text ${JSON.stringify(probe)} ${target}/${r}`));
  }
}
for (const bad of BAD_URLS) {
  const data = { content: walk(base.content, '', (s, k) => (URLISH.test(k) ? bad : s)), finance: walk(base.finance, '', (s, k) => (URLISH.test(k) ? bad : s)) };
  for (const r of ROUTES) for (const target of ['dist', 'preview']) {
    const html = MW.renderBody(data, { target, preview: target === 'preview', currentRoute: r }).html;
    renders++; failures.push(...scan(html, `url ${JSON.stringify(bad)} ${target}/${r}`));
  }
}
// safeUrl unit checks
const ok = ['https://www.facebook.com/x', 'media/a.jpg', 'mailto:a@b.org', 'tel:+923002903600', '#give', '../media/x.png'];
for (const u of ok) if (!MW.safeUrl(u)) failures.push(`safeUrl rejected a valid URL: ${u}`);
for (const u of BAD_URLS) if (MW.safeUrl(u)) failures.push(`safeUrl accepted: ${JSON.stringify(u)}`);

console.log(`${renders} page renders with ${PROBES.length} text payloads and ${BAD_URLS.length} hostile URLs.`);
if (failures.length) { console.log([...new Set(failures)].slice(0, 40).join('\n')); console.log(`FAIL: ${failures.length} problem(s)`); process.exit(1); }
console.log('PASS: nothing executable survived escaping.');
