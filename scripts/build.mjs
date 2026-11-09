#!/usr/bin/env node
/**
 * Static site build.
 *
 *   node scripts/build.mjs                 -> dist/ (preview build: banner, placeholders, noindex)
 *   node scripts/build.mjs --launch        -> dist/ (refuses unless every launch check passes)
 *   node scripts/build.mjs --check         -> print launch blockers, exit 1 if any
 *   node scripts/build.mjs --preview-file  -> preview/index.html (single-file review copy with sample toggle)
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rel = (...p) => join(ROOT, ...p);
await import(rel('src/lib.js'));
await import(rel('src/render.js'));
const MW = globalThis.MW;

const args = new Set(process.argv.slice(2));
const readJson = (p) => JSON.parse(readFileSync(rel(p), 'utf8'));

export function loadData() {
  return { content: readJson('content/site.json'), finance: readJson('config/finance.json') };
}

function deepMerge(base, over) {
  if (Array.isArray(over) || over === null || typeof over !== 'object') return over;
  const out = { ...(base && typeof base === 'object' && !Array.isArray(base) ? base : {}) };
  for (const [k, v] of Object.entries(over)) {
    if (k.startsWith('_')) continue;
    out[k] = deepMerge(out[k], v);
  }
  return out;
}

export function sampleData(data) {
  const s = readJson('content/sample.json');
  return { content: deepMerge(data.content, s), finance: deepMerge(data.finance, s._finance || {}) };
}

// ---------------------------------------------------------------------------
// Launch checks (acceptance criterion 12: no placeholders or unverified claims live)
// ---------------------------------------------------------------------------
export function launchBlockers(data) {
  const { content: c, finance: f } = data;
  const b = [];
  const need = (val, field) => { if (val === null || val === undefined || val === '') b.push(`${field} is missing`); };
  need(c.site.masjidName, 'MASJID_NAME (site.masjidName)');
  need(c.site.projectLocation, 'PROJECT_LOCATION (site.projectLocation)');
  need(c.site.projectCountry, 'PROJECT_COUNTRY (site.projectCountry)');
  need(c.site.headline, 'Headline (site.headline)');
  need(c.site.lede, 'Supporting sentence (site.lede)');
  need(c.site.canonicalUrl, 'Public URL (site.canonicalUrl)');
  if (c.site.primaryLanguageConfirmed !== true) b.push('PRIMARY_LANGUAGE not confirmed (site.primaryLanguageConfirmed)');
  need(c.organisation.name, 'COLLECTING_ORGANISATION_NAME');
  need(c.organisation.country, 'COLLECTING_ORGANISATION_COUNTRY');
  need(c.organisation.relationshipToMasjid, 'Relationship between organisation and masjid');
  if (c.organisation.country && c.site.projectCountry && c.organisation.country !== c.site.projectCountry) {
    need(c.organisation.onwardTransfer, 'Onward-transfer explanation (organisation and masjid are in different countries)');
  }
  need(c.contact.email, 'VERIFIED_CONTACT email');
  need(c.campaign.scopeLabel, 'Campaign scope label');
  need(c.campaign.allocationNote, 'Approved use-of-funds wording (campaign.allocationNote)');
  need(c.status.currentStage, 'CURRENT_STAGE');
  need(c.status.lastProjectUpdate, 'LAST_PROJECT_UPDATE');
  if (!c.heroPhoto || !c.heroPhoto.src || c.heroPhoto.placeholder) b.push('Hero image is missing');
  const actualPhotos = ((c.buildingToday && c.buildingToday.photos) || []).filter((x) => x.src && !x.placeholder && x.type !== 'design');
  if (c.heroPhoto && c.heroPhoto.type === 'design' && !actualPhotos.length) b.push('The hero shows a design visualisation: add at least one dated photograph of the actual site (buildingToday.photos) so real progress is shown nearby');
  if (c.heroPhoto && c.heroPhoto.type !== 'design' && !c.heroPhoto.date) b.push('Hero photograph needs its date');
  if (actualPhotos.some((x) => !x.date)) b.push(`${actualPhotos.filter((x) => !x.date).length} site photograph(s) need the month and year they were taken (buildingToday.photos[].date)`);
  need(c.policies.refund, 'REFUND_POLICY');
  need(c.policies.surplusAndDelays, 'SURPLUS_POLICY');
  need(c.policies.fees, 'Fees explanation');
  need(c.policies.retention, 'Privacy: retention period');
  if (MW.fundingSnapshot(c.campaign)) {
    need(c.campaign.reportingCurrency, 'REPORTING_CURRENCY (figures are shown)');
    need(c.campaign.figureSource, 'Figure source (figures are shown)');
  }

  const p = f.payments;
  const mode = MW.resolvePaymentMode(f, c.organisation);
  if (mode.mode !== 'live') {
    b.push(`Payments resolve to "${mode.mode}", not "live"` + (mode.reasons.length ? ': ' + mode.reasons.join(' ') : ' (set payments.mode to "live" once verified)'));
  }
  if (p.amountHandoff && p.amountHandoff.supported) {
    if (!p.presetsConfirmed) b.push('Preset amounts not confirmed (payments.presetsConfirmed)');
    if (!p.limitsConfirmed) b.push('Min/max amounts not confirmed (payments.limitsConfirmed)');
  }
  if (p.recurring && p.recurring.enabled && !p.recurring.cancellation) b.push('Monthly donations enabled without a cancellation policy');
  if (p.feeContribution && p.feeContribution.enabled) b.push('Fee contribution enabled: not implemented in v1; disable it');
  const bt = f.bankTransfer || {};
  if (bt.verified === true) {
    const accts = [...(bt.accounts || []), ...(bt.mobileWallets || [])];
    if (!accts.length) b.push('Bank transfer marked verified but no accounts are listed');
    accts.forEach((a, i) => {
      const label = a.bank || a.provider || `account ${i + 1}`;
      if (!a.accountTitle) b.push(`${label}: account title is missing`);
      if (a.holderType !== 'organisation' && !a.publicExplanation) b.push(`${label}: not confirmed as the organisation's own account; set holderType "organisation", or add publicExplanation saying whose account it is and why`);
    });
  }
  if ((c.funds || []).length > 1 && c.fundsSeparateConfirmed !== true) b.push('Two giving causes are offered: confirm the Jamia keeps them as separate funds (fundsSeparateConfirmed)');
  if (c.story && c.story.missionUr && c.story.translationNote && c.story.translationConfirmed !== true) b.push('English translation of the Urdu statement not confirmed (story.translationConfirmed)');

  // Any leftover placeholder/sample flags anywhere in content
  const walk = (node, path) => {
    if (node && typeof node === 'object') {
      if (node.placeholder === true) b.push(`Placeholder media at ${path}`);
      for (const [k, v] of Object.entries(node)) if (!k.startsWith('_')) walk(v, `${path}.${k}`);
    } else if (typeof node === 'string' && /\bsample\b|\[[A-Z_]{4,}\]/i.test(node)) {
      b.push(`Sample/placeholder text at ${path}: "${node.slice(0, 60)}"`);
    }
  };
  walk(c, 'content');
  return b;
}

// ---------------------------------------------------------------------------
// HTML documents
// ---------------------------------------------------------------------------
const css = () => readFileSync(rel('src/site.css'), 'utf8');
const js = (f) => readFileSync(rel('src', f), 'utf8');
// For inlining into <script>: a literal </script inside a template string would end the element.
const inlineJs = (f) => js(f).replace(/<\/(script)/gi, '<\\/$1');

const FONT_FACES = [
  ['Newsreader', 500, 'newsreader', 'newsreader-latin-500-normal.woff2'],
  ['Newsreader', 600, 'newsreader', 'newsreader-latin-600-normal.woff2'],
  ['Public Sans', 400, 'public-sans', 'public-sans-latin-400-normal.woff2'],
  ['Public Sans', 600, 'public-sans', 'public-sans-latin-600-normal.woff2'],
  ['Public Sans', 700, 'public-sans', 'public-sans-latin-700-normal.woff2'],
  ['Noto Nastaliq Urdu', 400, 'noto-nastaliq-urdu', 'noto-nastaliq-urdu-arabic-400-normal.woff2'],
  ['Amiri', 700, 'amiri', 'amiri-arabic-700-normal.woff2'],
];

function headMeta({ title, description, canonical, noindex, lang }) {
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${MW.esc(title)}</title>
${description ? `<meta name="description" content="${MW.esc(description)}">` : ''}
${canonical ? `<link rel="canonical" href="${MW.esc(canonical)}">` : ''}
${noindex ? '<meta name="robots" content="noindex, nofollow">' : ''}
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="theme-color" content="#18553D">`;
}

function description(c) {
  if (!c.site.masjidName) return '';
  return `Help build ${c.site.masjidName}${c.site.projectLocation ? ' in ' + c.site.projectLocation : ''}. See construction progress, the next funding need and how donations are handled.`;
}

function buildDist(launch) {
  const data = loadData();
  if (launch) {
    const blockers = launchBlockers(data);
    if (blockers.length) {
      console.error(`\nLaunch build refused. ${blockers.length} item(s) to resolve:\n` + blockers.map((x) => '  - ' + x).join('\n'));
      process.exit(1);
    }
  }
  const out = rel('dist');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, 'assets/fonts'), { recursive: true });

  const fontCss = FONT_FACES.map(([fam, w, pkg, file]) => {
    copyFileSync(rel('node_modules/@fontsource', pkg, 'files', file), join(out, 'assets/fonts', file));
    return `@font-face{font-family:"${fam}";font-style:normal;font-weight:${w};font-display:swap;src:url("fonts/${file}") format("woff2");}`;
  }).join('\n');
  writeFileSync(join(out, 'assets/site.css'), fontCss + '\n' + css());
  writeFileSync(join(out, 'assets/site.js'), js('lib.js') + '\n' + js('client.js') + '\nMW.initClient(document);\n');

  const lang = data.content.site.primaryLanguage || 'en';
  const canonicalBase = data.content.site.canonicalUrl ? data.content.site.canonicalUrl.replace(/\/?$/, '/') : null;
  for (const route of Object.keys(MW.ROUTES)) {
    const r = MW.renderBody(data, { target: 'dist', preview: !launch, currentRoute: route });
    const prefix = route === 'home' ? '' : '../';
    const doc = `<!DOCTYPE html>
<html lang="${MW.esc(lang)}">
<head>
${headMeta({ title: r.title, description: description(data.content), canonical: canonicalBase ? canonicalBase + MW.ROUTES[route].path : null, noindex: !launch || route === 'status', lang })}
<link rel="preload" href="${prefix}assets/fonts/newsreader-latin-500-normal.woff2" as="font" type="font/woff2" crossorigin>
${data.content.site.favicon ? `<link rel="icon" type="image/png" sizes="32x32" href="${prefix}${MW.esc(data.content.site.favicon)}">` : ''}
${data.content.site.appleTouchIcon ? `<link rel="apple-touch-icon" href="${prefix}${MW.esc(data.content.site.appleTouchIcon)}">` : ''}
<link rel="stylesheet" href="${prefix}assets/site.css">
<script src="${prefix}assets/site.js" defer></script>
</head>
<body>
${r.html}
</body>
</html>
`;
    const dir = join(out, MW.ROUTES[route].path);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), doc);
  }

  if (existsSync(rel('media'))) cpSync(rel('media'), join(out, 'media'), { recursive: true });

  writeFileSync(join(out, 'robots.txt'), launch && canonicalBase
    ? `User-agent: *\nDisallow: /donation-status/\nSitemap: ${canonicalBase}sitemap.xml\n`
    : 'User-agent: *\nDisallow: /\n');
  if (launch && canonicalBase) {
    const urls = ['home', 'masjid', 'progress', 'about', 'transparency', 'donate', 'privacy', 'policy'].map((r) => `  <url><loc>${canonicalBase}${MW.ROUTES[r].path}</loc></url>`).join('\n');
    writeFileSync(join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  }
  // Security headers for hosts that read a _headers file (Netlify, Cloudflare Pages). Mirror them elsewhere.
  writeFileSync(join(out, '_headers'), `/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  X-Frame-Options: DENY
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: same-origin
  X-Permitted-Cross-Domain-Policies: none
/assets/*
  Cache-Control: public, max-age=31536000, immutable
`);
  console.log(`Built dist/ (${launch ? 'LAUNCH' : 'preview'} build). Payment mode: ${MW.resolvePaymentMode(data.finance, data.content.organisation).mode}.`);
}

function dataUri(src) {
  if (!src || /^(data:|https?:)/.test(src)) return src;
  const ext = src.split('.').pop().toLowerCase();
  const type = { png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml' }[ext] || 'application/octet-stream';
  return `data:${type};base64,${readFileSync(rel(src)).toString('base64')}`;
}

function inlineMedia(data) {
  const d = JSON.parse(JSON.stringify(data));
  const s = d.content.site;
  if (s.logo && s.logo.src) s.logo.src = dataUri(s.logo.src);
  if (s.favicon) s.favicon = dataUri(s.favicon);
  const imgs = [s.heroPhoto ? [d.content.heroPhoto] : [], (d.content.heroPhoto ? [d.content.heroPhoto] : []), (d.content.buildingToday && d.content.buildingToday.photos) || [],
    (d.content.design && d.content.design.images) || [], (d.content.updates || []).map((u) => u.photo).filter(Boolean)].flat();
  for (const im of imgs) if (im && im.src && !im.placeholder) im.src = dataUri(im.src);
  return d;
}

function buildPreviewFile() {
  // Media stay as relative files (publish media/ next to preview/index.html); only the favicon is inlined.
  const data = loadData();
  if (data.content.site.favicon) data.content.site.favicon = dataUri(data.content.site.favicon);
  const sample = sampleData(data);
  const first = MW.renderBody(data, { target: 'preview', preview: true, variant: 'placeholder' });
  const payload = JSON.stringify({ placeholder: data, sample }).replace(/</g, '\\u003c');
  const doc = `<!DOCTYPE html>
<html lang="${MW.esc(data.content.site.primaryLanguage || 'en')}">
<head>
${headMeta({ title: 'Masjid Appeal Preview', noindex: true })}
${data.content.site.favicon ? `<link rel="icon" type="image/png" href="${data.content.site.favicon}">` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,500;6..72,600&family=Public+Sans:wght@400;600;700&family=Noto+Nastaliq+Urdu&family=Amiri:wght@700&display=swap">
<style>
${css()}
</style>
</head>
<body>
<div id="app">
${first.html}
</div>
<script>
${inlineJs('lib.js')}
${inlineJs('render.js')}
${inlineJs('client.js')}
MW.PREVIEW_DATA = ${payload};
${inlineJs('preview-runtime.js')}
</script>
</body>
</html>
`;
  mkdirSync(rel('preview'), { recursive: true });
  writeFileSync(rel('preview/index.html'), doc);
  if (existsSync(rel('media'))) cpSync(rel('media'), rel('preview/media'), { recursive: true });
  console.log(`Built preview/index.html (${(doc.length / 1024).toFixed(0)} KB).`);
}

// Anti-tamper: refuse to build if bank or payment details changed without approval.
const { checkLock } = await import('./finance-lock.mjs');
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const lock = checkLock(loadData());
  if (!lock.ok) { console.error('\nBUILD STOPPED. ' + lock.reason + '\n'); process.exit(2); }
}

if (args.has('--check')) {
  const b = launchBlockers(loadData());
  if (b.length) { console.log(`${b.length} launch blocker(s):\n` + b.map((x) => '  - ' + x).join('\n')); process.exit(1); }
  console.log('No launch blockers found. Still complete the manual checks in docs/LAUNCH-CHECKLIST.md.');
} else if (args.has('--preview-file')) {
  buildPreviewFile();
} else if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  buildDist(args.has('--launch'));
}
