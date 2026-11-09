/*
 * HTML renderer for every public view. Pure string templates, no dependencies.
 * Runs in Node (static build) and in the browser (preview sample toggle).
 * Every content string passes through esc(); placeholders render only when opts.preview is true.
 */
(function (MW) {
  'use strict';
  const { esc, formatMoney, formatDate, fundingSnapshot, resolvePaymentMode } = MW;

  const ROUTES = {
    home: { path: '', hash: 'top', title: null, nav: 'Home' },
    masjid: { path: 'masjid/', hash: 'masjid', title: 'The Masjid', nav: 'The Masjid' },
    progress: { path: 'progress/', hash: 'progress', title: 'Construction progress', nav: 'Progress' },
    about: { path: 'about/', hash: 'about', title: 'About us', nav: 'About us' },
    transparency: { path: 'transparency/', hash: 'transparency', title: 'Transparency and questions', nav: 'Transparency' },
    donate: { path: 'donate/', hash: 'donate', title: 'Donate' },
    privacy: { path: 'privacy/', hash: 'privacy', title: 'Privacy' },
    policy: { path: 'donation-policy/', hash: 'donation-policy', title: 'Donation policy' },
    status: { path: 'donation-status/', hash: 'donation-status', title: 'After your donation' },
  };

  function createContext(data, opts) {
    const c = data.content, f = data.finance;
    const P = !!opts.preview;
    const lang = (c.site && c.site.primaryLanguage) || 'en';
    const pay = resolvePaymentMode(f, c.organisation);
    const payments = f.payments || {};

    // --- placeholder helpers -------------------------------------------------
    const ph = (field, hint) => P
      ? `<mark class="ph"${hint ? ` title="${esc(hint)}"` : ''}><span class="vh">Placeholder: </span>${esc(field)}</mark>`
      : '';
    const phBlock = (field, hint) => P
      ? `<div class="ph-block" role="note"><p class="ph-block-k"><span class="ph-tag">Placeholder</span> ${esc(field)}</p>${hint ? `<p>${esc(hint)}</p>` : ''}</div>`
      : '';
    const has = (x) => x !== null && x !== undefined && x !== '' && !(Array.isArray(x) && x.length === 0);
    const v = (val, field, hint) => has(val) ? esc(val) : ph(field, hint);
    const vt = (val, field) => has(val) ? String(val) : (P ? `[${field}]` : '');

    // --- links -----------------------------------------------------------------
    function link(route, anchor) {
      if (opts.target === 'preview') {
        if (anchor) return '#' + anchor;
        return '#' + ROUTES[route].hash;
      }
      const prefix = opts.currentRoute && opts.currentRoute !== 'home' ? '../' : '';
      if (route === 'home') return anchor ? (opts.currentRoute === 'home' ? '#' + anchor : prefix + '#' + anchor) : (prefix || './');
      return prefix + ROUTES[route].path + (anchor ? '#' + anchor : '');
    }

    // Site identity is the Jamia (whole campus); the masjid is the project being built.
    const name = c.site.siteName || c.site.masjidName;
    const nameText = vt(name, 'MASJID_NAME');
    const project = c.site.masjidName;
    const org = c.organisation || {};
    const providerName = payments.providerDisplayName || payments.provider;
    const numLocale = (c.site && c.site.numberLocale) || lang;
    const money = (minor, cur, o) => formatMoney(minor, cur, numLocale, o);
    const dc = c.site && c.site.displayCurrency;
    // Euro (display) amount on top, source-currency amount underneath in smaller type.
    const dual = (minor, cur, o2) => {
      o2 = o2 || {};
      if (!dc || !Number.isInteger(minor) || cur !== dc.sourceCurrency) return `<span class="num">${esc(money(minor, cur, { compact: true }))}</span>`;
      const conv = MW.convertApprox(minor, cur, dc.code, dc.rate);
      return `<span class="amt"><span class="amt-main num">${o2.approx ? '≈ ' : ''}${esc(formatMoney(conv, dc.code, dc.locale || numLocale, { compact: true }))}</span><span class="amt-sub num">${esc(money(minor, cur, { compact: true }))}</span></span>`;
    };
    const rateNote = () => dc ? `<p class="fine rate-note">Euro amounts are approximate, converted at €1 = ${esc(dc.sourceCurrency)} ${esc(dc.rate)} (${esc(dc.source)}, ${esc(formatDate(dc.asOf, (c.site && c.site.dateLocale) || lang))}) and rounded, so they may not add up exactly. Costs are set in Pakistani rupees.</p>` : '';
    // Giving causes and set gifts, priced from the published costs (PKR) and shown in the display currency.
    const unitCosts = (() => {
      const u = {};
      (c.campaign.costBreakdown || []).forEach((r) => { if (r.gift && r.gift.units) u[r.item] = r.cost / r.gift.units; });
      if (c.studentCost && c.studentCost.annualPkrMinor) u['student-day'] = c.studentCost.annualPkrMinor / 365;
      return u;
    })();
    // Gift tiles: masjid materials (priced per unit from the cost breakdown) and student-support periods.
    const tiles = { masjid: [], students: [] };
    if (dc) {
      (c.campaign.costBreakdown || []).filter((r) => r.gift && Number.isInteger(r.cost) && r.gift.units > 0).forEach((r) => {
        const g = r.gift;
        const maxEuro = Math.floor(r.cost / 100 / dc.rate / g.euroStep) * g.euroStep;
        tiles.masjid.push({ kind: 'material', name: r.item, icon: g.icon, unitMinor: r.cost / g.units, unit: g.unit, unitPlural: g.unitPlural, phrase: g.phrase, countable: !!g.countable,
          step: g.euroStep || 5, min: g.euroMin || g.euroStep || 5, amount: g.euroDefault || g.euroMin || 5, max: Math.max(g.euroMin || 5, maxEuro) });
      });
      if (unitCosts['student-day']) {
        (c.studentGifts || []).forEach((g) => tiles.students.push({ kind: 'student', id: g.id, name: g.name, icon: g.icon, periodDays: g.periodDays, periodLabel: g.periodLabel, possessive: g.possessive,
          step: g.euroStep || 5, min: g.euroMin || 5, amount: g.euroDefault || g.euroMin || 5, max: 10000 }));
      }
    }
    const describeTile = (t, euros) => t.kind === 'student'
      ? MW.describeStudentGift(euros, t, dc.rate, unitCosts['student-day'])
      : MW.describeQty((euros * dc.rate * 100) / t.unitMinor, t);
    const funds = (c.funds || []).filter((f) => f && f.id);
    const asset = (raw) => {
      if (!raw) return '';
      if (/^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(raw)) return raw;
      const src = MW.safeUrl(raw);
      if (!src || src.startsWith('mailto:') || src.startsWith('tel:')) return '';
      return /^https:/.test(src) || opts.target === 'preview' || !opts.currentRoute || opts.currentRoute === 'home' ? src : '../' + src;
    };
    const logo = (cls) => c.site.logo && c.site.logo.src
      ? `<img class="${cls}" src="${esc(asset(c.site.logo.src))}" alt="" width="${esc(c.site.logo.width || 96)}" height="${esc(c.site.logo.height || 96)}" decoding="async">`
      : ICON_ARCH.replace('class="brand-mark"', `class="brand-mark ${cls}"`);
    const date = (iso) => formatDate(iso, (c.site && c.site.dateLocale) || lang);

    return { c, f, P, lang, numLocale, pay, payments, ph, phBlock, has, v, vt, link, name, nameText, project, org, tiles, describeTile, funds, unitCosts, providerName, money, date, opts, asset, logo, dual, rateNote, dc };
  }

  // ---------------------------------------------------------------------------
  // Shared pieces
  // ---------------------------------------------------------------------------
  const ICON_ARCH = '<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M6 29V15.5C6 9.5 10.5 5.2 16 3c5.5 2.2 10 6.5 10 12.5V29" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M11.5 29v-8.8c0-2.7 2-4.6 4.5-5.7 2.5 1.1 4.5 3 4.5 5.7V29" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M3 29h26" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';

  function msIcon(status) {
    if (status === 'completed') return '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="9" fill="currentColor"/><path d="M5.8 10.3l2.7 2.7 5.7-6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    if (status === 'in_progress') return '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="8.2" fill="#fff" stroke="currentColor" stroke-width="1.8"/><path d="M10 1.8a8.2 8.2 0 0 1 0 16.4z" fill="currentColor"/></svg>';
    return '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="8.2" fill="#fff" stroke="currentColor" stroke-width="1.8" stroke-dasharray="3 2.4"/></svg>';
  }
  const MS_LABEL = { completed: 'Completed', in_progress: 'In progress', planned: 'Planned' };

  function photo(ctx, p, o) {
    o = o || {};
    const { esc: e } = MW;
    const typeLabel = p && p.typeLabel ? e(p.typeLabel) : (p && p.type === 'design' ? 'Proposed design · visualisation' : 'Photo');
    const dateTxt = p && p.date ? ctx.date(p.date) : '';
    const meta = p
      ? `<span class="photo-type photo-type-${p.type === 'design' ? 'design' : 'actual'}">${typeLabel}${dateTxt ? ` · <time datetime="${e(p.date)}">${e(dateTxt)}</time>` : (p.type === 'actual' && ctx.P && p.src ? ' · ' + ctx.ph('PHOTO_DATE', 'Month and year this photo was taken') : '')}</span>`
      : '';
    const cap = p && p.caption ? `<span class="photo-cap">${e(p.caption)}</span>` : '';
    let media;
    if (p && p.src && !p.placeholder) {
      const srcset = p.srcset ? ` srcset="${e(String(p.srcset).split(',').map((x) => { const [u, w] = x.trim().split(/\s+/); return ctx.asset(u) + ' ' + w; }).join(', '))}" sizes="${e(o.sizes || '(min-width: 1000px) 640px, 100vw')}"` : '';
      media = `<img src="${e(ctx.asset(p.src))}"${srcset} alt="${e(p.alt || '')}" width="${e(p.width || 1600)}" height="${e(p.height || 1200)}"${o.eager ? ' fetchpriority="high"' : ' loading="lazy" decoding="async"'}>`;
    } else {
      if (!ctx.P) return '';
      const alt = p && p.alt ? p.alt : (o.hint || 'Recent photograph of the actual site');
      media = `<div class="photo-ph" role="img" aria-label="${e('Photo placeholder: ' + alt)}"><span class="photo-ph-k">${e(o.field || 'APPROVED_PHOTOS')}</span><span class="photo-ph-alt">${e(alt)}</span></div>`;
    }
    if (o.zoom && p && p.src && !p.placeholder) {
      const full = ctx.asset(p.src);
      const zcap = [p.typeLabel || (p.type === 'design' ? 'Design' : 'Photo'), p.caption].filter(Boolean).join(' · ');
      media = `<a class="zoom" href="${e(full)}" data-lightbox="${e(o.zoom)}" data-caption="${e(zcap)}" data-alt="${e(p.alt || '')}">${media}<span class="zoom-badge" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg></span><span class="vh"> (open larger)</span></a>`;
    }
    return `<figure class="photo ${o.cls || ''}">${media}${meta || cap ? `<figcaption>${meta}${cap}</figcaption>` : ''}</figure>`;
  }

  // ---------------------------------------------------------------------------
  // Banner, header, footer
  // ---------------------------------------------------------------------------
  function banner(ctx) {
    if (!ctx.P) return '';
    const sample = ctx.opts.variant === 'sample';
    const modeTxt = {
      preview: 'Payments: not connected (preview). Nothing can be charged.',
      test: 'Payments: provider TEST mode. No real money moves.',
      live: 'Payments: live.',
    }[ctx.pay.mode];
    const toggle = ctx.opts.target === 'preview'
      ? `<div class="pv-toggle" role="group" aria-label="Preview content"><button type="button" data-variant="placeholder" aria-pressed="${!sample}">Placeholders</button><button type="button" data-variant="sample" aria-pressed="${sample}">Sample data</button></div>`
      : '';
    const lead = sample
      ? '<strong>Sample data.</strong> Invented values for reviewing the layout. None of these names, figures or dates are real.'
      : '<strong>Preview, not for launch.</strong> Items marked <mark class="ph ph-inline">LIKE_THIS</mark> are waiting for verified information.';
    return `<div class="pv-banner${sample ? ' pv-sample' : ''}" role="region" aria-label="Preview notice"><div class="wrap pv-inner"><p>${lead} <span class="pv-mode">${modeTxt}</span></p>${toggle}</div></div>`;
  }

  function header(ctx) {
    const { link, c } = ctx;
    const loc = c.site.projectLocation;
    return `<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="${link('home')}">${ctx.logo('brand-logo')}<span class="brand-text"><span class="brand-name">${c.site.shortName && ctx.name ? `<span class="name-full">${esc(ctx.name)}</span><span class="name-short" aria-hidden="true">${esc(c.site.shortName)}</span>` : ctx.v(ctx.name, 'MASJID_NAME')}</span><span class="brand-loc">${c.site.siteName && ctx.project ? esc(ctx.project) : ctx.v(loc, 'PROJECT_LOCATION')}</span></span></a>
    <nav class="site-nav" aria-label="Main">
      <button type="button" class="menu-btn" aria-expanded="false" aria-controls="nav-list"><span class="menu-icon" aria-hidden="true"></span>Menu</button>
      <ul id="nav-list" class="nav-list">${['home', 'masjid', 'progress', 'about', 'transparency'].map((r) => `
        <li><a href="${link(r)}" data-nav="${r}"${ctx.opts.currentRoute === r ? ' aria-current="page"' : ''}>${ROUTES[r].nav}</a></li>`).join('')}
      </ul>
    </nav>
    <a class="btn btn-primary header-donate" href="${ctx.opts.currentRoute === 'home' ? link('home', 'give') : link('donate')}">Donate Now</a>
  </div>
</header>`;
  }

  function contactLines(ctx) {
    const ct = ctx.c.contact || {};
    const out = [];
    if (ct.person) out.push(`<span>${esc(ct.person)}</span>`);
    if (ct.email) out.push(`<a href="mailto:${esc(ct.email)}">${esc(ct.email)}</a>`);
    else out.push(`<span>${ctx.ph('VERIFIED_CONTACT', 'Organisational email address and, if approved, phone/WhatsApp')}</span>`);
    if (ct.phone) {
      const nums = String(ct.phone).split(/\s*[·,;\/]\s*/).filter(Boolean);
      out.push(`<span class="phones"><span class="phones-k">Phone:</span>${nums.map((n) => `<a href="tel:${esc(n.replace(/[^+\d]/g, ''))}" class="phone-n">${esc(n)}</a>`).join('')}</span>`);
    }
    if (ct.whatsapp) out.push(`<span>WhatsApp: ${esc(ct.whatsapp)}</span>`);
    if (ct.facebook) out.push(`<span>Facebook: <a href="${esc(MW.safeUrl(ct.facebook))}" rel="noopener noreferrer">our Facebook page</a></span>`);
    return out.filter(Boolean);
  }

  function footer(ctx) {
    const { c, org, link } = ctx;
    const year = new Date().getFullYear();
    const modeNote = ctx.pay.mode === 'live' ? '' : `<p class="footer-mode">${ctx.pay.mode === 'test' ? 'Donations are in provider test mode.' : 'Online donations are not yet connected.'}</p>`;
    return `<footer class="site-footer">
  <div class="wrap footer-grid">
    <div class="footer-id">
      <p class="footer-name">${ctx.logo('footer-logo')}<span>${ctx.v(ctx.name, 'MASJID_NAME')}</span></p>
      ${c.site.siteName && ctx.project ? `<p class="footer-project">${esc(ctx.project)}</p>` : ''}
      ${c.site.taglineUr ? `<p class="footer-tag-ur" lang="ur" dir="rtl">${esc(c.site.taglineUr)}</p>` : ''}
      ${c.site.tagline ? `<p class="footer-tag">${esc(c.site.tagline)}</p>` : ''}
      <p>${c.site.address ? esc(c.site.address) : ctx.v(c.site.projectLocation, 'PROJECT_LOCATION')}${c.site.projectCountry ? ', ' + esc(c.site.projectCountry) : (ctx.P ? ', ' + ctx.ph('PROJECT_COUNTRY') : '')}</p>
    </div>
    <div>
      <h2 class="footer-h">Donations received by</h2>
      <p>${ctx.v(org.name, 'COLLECTING_ORGANISATION_NAME')}${org.country ? ' (' + esc(org.country) + ')' : (ctx.P ? ' ' + ctx.ph('COLLECTING_ORGANISATION_COUNTRY') : '')}</p>
      ${org.registration ? `<p>${esc(org.registration)}</p>` : (ctx.P ? `<p>${ctx.ph('VERIFIED_REGISTRATION_DETAILS', 'Only if applicable')}</p>` : '')}
    </div>
    <div>
      <h2 class="footer-h">Contact</h2>
      <p class="stack">${contactLines(ctx).join('')}</p>
    </div>
    <div>
      <h2 class="footer-h">Information</h2>
      <ul class="footer-links">
        <li><a href="${link('masjid')}">The Masjid</a></li>
        <li><a href="${link('progress')}">Progress</a></li>
        <li><a href="${link('about')}">About us</a></li>
        <li><a href="${link('transparency')}">Transparency</a></li>
        <li><a href="${link('donate')}">Donate</a></li>
        <li><a href="${link('policy')}">Donation policy</a></li>
        <li><a href="${link('privacy')}">Privacy</a></li>
      </ul>
    </div>
  </div>
  <div class="wrap footer-base">
    <p>© ${year} ${org.name ? esc(org.name) : esc(ctx.nameText)}</p>
    ${modeNote}
  </div>
</footer>`;
  }

  // ---------------------------------------------------------------------------
  // Donation card (server-rendered; enhanced by donate.js)
  // ---------------------------------------------------------------------------
  function donationConfig(ctx) {
    const p = ctx.payments;
    const mode = ctx.pay.mode;
    const showAmounts = mode === 'preview' || !!(p.amountHandoff && p.amountHandoff.supported);
    return {
      mode,
      reasons: ctx.pay.reasons,
      campaignId: ctx.c.campaign.id,
      lang: ctx.numLocale,
      currency: p.currency || null,
      provider: ctx.providerName || null,
      showAmounts,
      presets: Array.isArray(p.presets) ? p.presets : [],
      presetsConfirmed: !!p.presetsConfirmed,
      defaultPreset: p.defaultPreset || null,
      allowCustom: p.allowCustom !== false,
      min: p.minAmount || 100,
      max: p.maxAmount || 10000000,
      recurring: p.recurring && p.recurring.enabled ? p.recurring : null,
      handoff: p.amountHandoff || {},
      url: (() => { const u = mode === 'live' ? p.liveUrl : mode === 'test' ? p.testUrl : null; return u && MW.isAllowedPaymentUrl(u, p.allowedHosts) ? u : null; })(),
      allowedHosts: p.allowedHosts || [],
      contact: (ctx.c.contact && ctx.c.contact.email) || null,
      equiv: ctx.dc && p.currency === ctx.dc.code ? { code: ctx.dc.sourceCurrency, rate: ctx.dc.rate, locale: ctx.numLocale } : null,
      funds: showAmounts ? ctx.funds.map((f) => ({ id: f.id, name: f.name, url: (() => { const u = mode === 'live' ? f.liveUrl : mode === 'test' ? f.testUrl : null; return u && MW.isAllowedPaymentUrl(u, p.allowedHosts) ? u : null; })() })) : [],
      tiles: showAmounts && ctx.dc && p.currency === ctx.dc.code ? ctx.tiles : { masjid: [], students: [] },
      studentDayPkrMinor: ctx.unitCosts['student-day'] || null,
      fundParam: (p.amountHandoff && p.amountHandoff.fundParam) || null,
    };
  }


  const MAT_ICON = {
    meal: '<svg class="mat-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><path d="M4 16h24a12 12 0 0 1-24 0z"/><path d="M12 6c0 2 2 2 2 4M17 6c0 2 2 2 2 4"/></svg>',
    week: '<svg class="mat-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><rect x="5" y="7" width="22" height="20" rx="2"/><path d="M5 13h22M11 4v5M21 4v5M9 18h14"/></svg>',
    month: '<svg class="mat-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><rect x="5" y="7" width="22" height="20" rx="2"/><path d="M5 13h22M11 4v5M21 4v5M10 18h2M15 18h2M20 18h2M10 22h2M15 22h2"/></svg>',
    bed: '<svg class="mat-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><path d="M4 9v16M4 20h24v5M4 16h24v4"/><path d="M9 16v-3a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3"/></svg>',
    cap: '<svg class="mat-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><path d="M4 12 16 6l12 6-12 6z"/><path d="M9 14.5V20c0 1.7 3.1 3 7 3s7-1.3 7-3v-5.5M28 12v6"/></svg>',
    bag: '<svg class="mat-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M8 7h16l2 4v15a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V11z"/><path d="M6 11h20M11 17h10M11 21h7"/></svg>',
    blocks: '<svg class="mat-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="4" y="18" width="11" height="7" rx="1"/><rect x="17" y="18" width="11" height="7" rx="1"/><rect x="10" y="10" width="11" height="7" rx="1"/></svg>',
    truck: '<svg class="mat-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M3 9h16v13H3zM19 13h6l4 5v4H19z"/><circle cx="9" cy="24" r="2.5"/><circle cx="23" cy="24" r="2.5"/><path d="M6 9l3-3 3 2 3-3 2 4"/></svg>',
    sand: '<svg class="mat-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M3 25c3-8 7-13 13-13s10 5 13 13z"/><path d="M11 19h.01M16 16h.01M20 20h.01M14 22h.01"/></svg>',
    aggregate: '<svg class="mat-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M4 25l3-5 5 1 2 4zM12 25l3-6 6-1 2 7zM21 25l2-5 5 1 1 4zM9 18l3-5 5 1-1 5z"/></svg>',
  };

  function donationCard(ctx, id, o) {
    o = o || {};
    const cfg = donationConfig(ctx);
    const { org } = ctx;
    const cur = cfg.currency;
    const money = (m) => ctx.money(m, cur, { compact: true });
    const provider = cfg.provider ? esc(cfg.provider) : (ctx.P ? ctx.ph('PAYMENT_PROVIDER') : 'our payment provider');

    const modeNote = {
      preview: `<p class="mode-note mode-preview"><strong>Preview:</strong> payments are not connected. Nothing will be charged.</p>`,
      test: `<p class="mode-note mode-test"><strong>Test mode:</strong> opens the provider's sandbox. Use test details only; no real money moves.</p>`,
      live: '',
    }[cfg.mode];

    const freq = cfg.recurring ? `
      <fieldset class="seg">
        <legend class="field-label">How often</legend>
        <div class="seg-row">
          <input type="radio" id="${id}-f-once" name="${id}-freq" value="once" checked><label for="${id}-f-once">Once</label>
          <input type="radio" id="${id}-f-monthly" name="${id}-freq" value="monthly"><label for="${id}-f-monthly">Monthly</label>
        </div>
        <p class="field-help" id="${id}-freq-help" data-monthly-help hidden>Charged ${esc(cfg.recurring.firstCharge || 'today')}, then once per month. ${esc(cfg.recurring.cancellation || '')}</p>
      </fieldset>` : '';

    let amounts = '';
    if (cfg.showAmounts) {
      const presets = cfg.presets.map((m, i) => `
          <input type="radio" id="${id}-p${i}" name="${id}-amount" value="${m}"${m === cfg.defaultPreset ? ' checked' : ''}><label for="${id}-p${i}">${esc(money(m))}</label>`).join('');
      const unconfirmed = ctx.P && (!cfg.presetsConfirmed || !cur)
        ? `<p class="field-help">${ctx.ph('PRESETS · DONATION_CURRENCY', 'Preset amounts and currency to be confirmed with the provider')}</p>` : '';
      amounts = `
      <fieldset class="amounts">
        <legend class="field-label">Amount${cur ? ` (${esc(cur)})` : ''}</legend>
        <div class="preset-grid">${presets}
        </div>
        ${cfg.allowCustom ? `
        <div class="custom">
          <label for="${id}-custom" class="field-label-sm">Other amount</label>
          <div class="custom-input"><span class="custom-cur" aria-hidden="true">${esc(cur || '¤')}</span><input id="${id}-custom" name="custom" type="text" inputmode="decimal" autocomplete="off" aria-describedby="${id}-err"></div>
        </div>` : ''}
        ${unconfirmed}
      </fieldset>`;
    } else {
      amounts = `<p class="field-help">You will choose your amount on ${provider}'s secure page.</p>`;
    }

    let causes = '';
    const T = cfg.tiles;
    if (cfg.funds.length > 1 && (T.masjid.length || T.students.length)) {
      const eur = (major) => formatMoney(major * 100, cur, ctx.dc.locale || ctx.numLocale, { compact: true });
      const panel = (key, list, heading) => {
        if (!list.length) return '';
        const first = list[0];
        return `
      <div class="mat-panel" data-panel="${key}" hidden>
        <fieldset class="mat-field">
          <legend class="field-label">${heading}</legend>
          <div class="mat-tiles">${list.map((t, i) => `
            <input type="radio" id="${id}-${key}${i}" name="${id}-${key}" value="${i}"${i === 0 ? ' checked' : ''}><label for="${id}-${key}${i}">${MAT_ICON[t.icon] || ''}<span class="mat-name">${esc(t.name)}</span><span class="mat-from">from ${esc(eur(t.min))}</span></label>`).join('')}
          </div>
        </fieldset>
        <div class="impact">
          <p class="impact-k">Your gift covers about</p>
          <p class="impact-title" data-impact-title aria-live="polite">${esc(ctx.describeTile(first, first.amount))}</p>
          <div class="amt-stepper">
            <button type="button" class="qty-btn" data-amt-dec aria-label="Less">−</button>
            <div class="amt-field"><span class="amt-cur" aria-hidden="true">€</span><label for="${id}-${key}amt" class="vh">Amount in euros</label><input id="${id}-${key}amt" class="qty-input" data-amt-input type="number" inputmode="numeric" min="${first.min}" step="${first.step}" max="${first.max}" value="${first.amount}" aria-describedby="${id}-err ${id}-${key}hint"></div>
            <button type="button" class="qty-btn" data-amt-inc aria-label="More">+</button>
          </div>
          <p class="impact-hint" id="${id}-${key}hint" data-step-hint>In steps of ${esc(eur(first.step))}, from ${esc(eur(first.min))}</p>
        </div>
        <p class="mat-note">${key === 'masjid' ? "Quantities are worked out from the costs on the Jamia's construction appeal." : "Based on the Jamia's estimate of about PKR 100,000 per student per year for food and accommodation."}${ctx.P && !ctx.c.fundsSeparateConfirmed ? ' ' + ctx.ph('FUND_SEPARATION', 'Confirm that the Jamia keeps construction gifts and student gifts in separate funds and can show how each is spent.') : ''}</p>
      </div>`;
      };
      causes = `
      <fieldset class="seg give-by">
        <legend class="field-label">Give by</legend>
        <div class="seg-row seg-3">
          <input type="radio" id="${id}-gm-amount" name="${id}-givemode" value="amount" checked><label for="${id}-gm-amount">Amount</label>
          ${T.masjid.length ? `<input type="radio" id="${id}-gm-masjid" name="${id}-givemode" value="masjid"><label for="${id}-gm-masjid">Masjid</label>` : ''}
          ${T.students.length ? `<input type="radio" id="${id}-gm-students" name="${id}-givemode" value="students"><label for="${id}-gm-students">Students</label>` : ''}
        </div>
      </fieldset>
      ${panel('masjid', T.masjid, 'Choose a building material')}
      ${panel('students', T.students, "Support the students' food and board")}`;
      amounts = `<div data-panel="amount">
        <fieldset class="seg to-fund">
          <legend class="field-label">Give to</legend>
          <div class="seg-row">${cfg.funds.map((f, i) => `
            <input type="radio" id="${id}-to-${esc(f.id)}" name="${id}-to" value="${esc(f.id)}"${i === 0 ? ' checked' : ''}><label for="${id}-to-${esc(f.id)}">${esc(f.id === 'student-support' ? 'Students' : 'Masjid')}</label>`).join('')}
          </div>
        </fieldset>
        ${amounts}
      </div>`;
    }

    const noJsFallback = cfg.url
      ? `<noscript><p><a class="btn btn-primary btn-block" href="${esc(cfg.url)}">Continue to the secure donation page</a></p></noscript>`
      : '';

    return `<div class="donate-card" data-donate id="${id}" data-mode="${cfg.mode}">
  <h2 class="donate-h" id="${id}-h">${esc(o.heading || 'Make a donation')}</h2>
  <p class="donate-to">Received by <strong>${ctx.v(org.name, 'COLLECTING_ORGANISATION_NAME')}</strong>${org.name && /\.$/.test(org.name) ? '' : '.'} You pay on ${provider}'s secure page.</p>
  ${modeNote}
  <form class="donate-form" novalidate aria-labelledby="${id}-h">
    ${freq}
    ${causes}
    ${amounts}
    <p class="field-error" id="${id}-err" role="alert"></p>
    <p class="donate-summary" aria-live="polite" data-summary></p>
    <button type="submit" class="btn btn-primary btn-lg btn-block" data-submit>${cfg.showAmounts ? 'Donate' : 'Continue to secure donation page'}</button>
    ${noJsFallback}
  </form>
  <div class="handoff" data-handoff hidden tabindex="-1" role="region" aria-label="Payment preview"></div>
  ${bankAvailable(ctx) ? `<p class="donate-alt">Prefer a bank transfer? <a href="${o.bankLink || ctx.link('home', 'bank-transfer')}">See the account details</a></p>` : ''}
  <p class="donate-fine">${(ctx.payments.methods || []).length ? `Payment methods: ${esc(ctx.payments.methods.join(', '))}.` : (ctx.P ? `Payment methods: ${ctx.ph('ENABLED_PAYMENT_METHODS', 'List only methods the provider account actually offers')}` : 'The provider shows the payment methods available to you.')} This website never receives your card or bank details.</p>
  <script type="application/json" data-donate-config>${JSON.stringify(cfg).replace(/</g, '\\u003c')}</script>
</div>`;
  }

  // ---------------------------------------------------------------------------
  // Home view
  // ---------------------------------------------------------------------------
  const ORN = '<svg class="bless-orn" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 1.5 14.2 9.8 22.5 12 14.2 14.2 12 22.5 9.8 14.2 1.5 12 9.8 9.8z" fill="currentColor"/><circle cx="12" cy="12" r="2.2" fill="var(--bless-bg, #fff)"/></svg>';

  const FB = '<svg class="fb-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M13.5 21v-7.5H16l.5-3h-3V8.6c0-.9.3-1.6 1.6-1.6h1.7V4.3c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.4-4 4.1v2.2H7.7v3h2.7V21z"/></svg>';

  function hero(ctx) {
    const { c, link } = ctx;
    const s = c.site, st = c.status;
    const place = [s.projectLocation, s.projectCountry].filter(Boolean).map(esc).join(', ') || (ctx.P ? ctx.ph('PROJECT_LOCATION') + ' ' + ctx.ph('PROJECT_COUNTRY') : '');
    const statusLine = (st.currentStage || ctx.P)
      ? `<p class="status-line"><span class="status-dot" aria-hidden="true"></span><span>Current stage: <strong>${ctx.v(st.currentStage, 'CURRENT_STAGE')}</strong>${st.lastProjectUpdate ? ` · Updated <time datetime="${esc(st.lastProjectUpdate)}">${esc(ctx.date(st.lastProjectUpdate))}</time>` : (ctx.P ? ' · Updated ' + ctx.ph('LAST_PROJECT_UPDATE') : '')}</span></p>`
      : '';
    return `<section class="hero" aria-labelledby="hero-h">
  ${s.openingLineAr || s.salutationAr ? `<div class="wrap hero-blessing">
    ${s.openingLineAr ? `<p class="bless-bismillah"><span lang="ar" dir="rtl">${esc(s.openingLineAr)}</span></p>` : ''}
    ${s.salutationAr ? `<p class="bless-salutation"><span lang="ar" dir="rtl">${esc(s.salutationAr)}</span></p>` : ''}
  </div>` : ''}
  <div class="wrap hero-grid">
    <div class="hero-main">
      <p class="eyebrow">${place} · ${ctx.funds.length > 1 ? 'Masjid construction and student support' : 'Masjid construction appeal'}</p>
      ${s.masjidNameUr ? `<p class="name-ur" lang="ur" dir="rtl">${esc(s.masjidNameUr)}</p>` : ''}
      <h1 id="hero-h">${ctx.v(s.headline, 'HEADLINE', 'Short headline built from verified facts, e.g. “Help complete a masjid for our community.”')}</h1>
      <p class="lede">${ctx.v(s.lede, 'LEDE', 'One sentence: what exists now and what the next funds will do')}</p>
      <div class="actions">
        <a class="btn btn-primary btn-lg" href="${link('home', 'give')}">Donate Now</a>
        <a class="btn btn-secondary btn-lg" href="${link('progress')}">View Progress</a>
      </div>
      ${statusLine}
      ${(() => {
        const main = photo(ctx, c.heroPhoto, { eager: true, cls: 'hero-photo', field: 'HERO_PHOTO', hint: 'Recent photograph of the actual site or building' });
        const real = ((c.buildingToday || {}).photos || []).filter((p) => p.src && !p.placeholder && p.type !== 'design');
        const latest = real[real.length - 1];
        if (!latest || !c.heroPhoto || c.heroPhoto.type !== 'design') return main;
        return `<div class="hero-visual">${main}<a class="hero-inset" href="${link('progress')}"><img src="${esc(ctx.asset(latest.thumb || latest.src))}" alt="" width="120" height="120" loading="lazy" decoding="async"><span><strong>On site now</strong>${esc((latest.caption || '').split(':')[0] || 'Construction')} work. See progress</span></a></div>`;
      })()}
    </div>
    <div class="hero-aside">
      ${donationCard(ctx, 'give')}
    </div>
  </div>
</section>`;
  }

  function waysToGive(ctx) {
    if (ctx.funds.length < 2 || !ctx.dc) return '';
    const { c } = ctx;
    const cur = ctx.payments.currency;
    const hl = c.waysHighlights || {};
    const giftBtns = (fid) => {
      const key = fid === 'student-support' ? 'students' : 'masjid';
      const list = ctx.tiles[key] || [];
      return (hl[key] || []).map(([ref, euros]) => {
        const i = list.findIndex((t) => t.name === ref || t.id === ref);
        if (i < 0) return '';
        const title = ctx.describeTile(list[i], euros);
        return `<li><a class="way-gift" href="${ctx.link('home', 'give')}" data-pick-tab="${key}" data-pick-tile="${i}" data-pick-amount="${euros}"><span class="way-gift-title">${esc(title.charAt(0).toUpperCase() + title.slice(1))}</span><span class="way-gift-amt">${esc(ctx.money(euros * 100, cur, { compact: true }))}</span></a></li>`;
      }).join('');
    };
    const sc = c.studentCost && c.studentCost.annualPkrMinor;
    const masjid = ctx.funds[0], students = ctx.funds[1];
    const snap = c.campaign.currentPhaseTarget;
    return `<section id="ways" class="band ways" aria-labelledby="ways-h">
  <div class="wrap">
    <div class="section-head split"><div><p class="eyebrow">Two ways to give</p><h2 id="ways-h">Choose what your gift supports</h2></div><p class="section-intro">Give towards building the new masjid, or towards the daily needs of the Jamia's students. You choose when you donate.</p></div>
    <div class="ways-grid">
      <article class="way way-masjid">
        <header class="way-head">${MAT_ICON.blocks.replace('mat-icon', 'way-icon')}<div><h3>${esc(masjid.name)}</h3><p>${esc(masjid.description || '')}</p></div></header>
        ${Number.isInteger(snap) ? `<div class="way-fact"><span class="way-fact-k">Foundation materials needed</span>${ctx.dual(snap, c.campaign.reportingCurrency, { approx: true })}</div>` : ''}
        <ul class="way-gifts" role="list">${giftBtns(masjid.id)}</ul>
        <p class="way-more"><a class="text-link" href="${ctx.link('masjid', 'needs')}">See the full cost breakdown</a></p>
      </article>
      <article class="way way-students">
        <header class="way-head"><svg class="way-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><path d="M4 12 16 6l12 6-12 6z"/><path d="M9 14.5V20c0 1.7 3.1 3 7 3s7-1.3 7-3v-5.5"/><path d="M28 12v6"/></svg><div><h3>${esc(students.name)}</h3><p>${esc(students.description || '')}</p></div></header>
        ${sc ? `<div class="way-fact"><span class="way-fact-k">A student's food and board for a year</span>${ctx.dual(sc, 'PKR', { approx: true })}</div>` : ''}
        <ul class="way-gifts" role="list">${giftBtns(students.id)}</ul>
        <p class="way-more">${students.zakat ? 'Zakat is accepted for the students. ' : ''}<a class="text-link" href="${ctx.link('about')}">About us</a></p>
      </article>
    </div>
    ${ctx.rateNote()}
  </div>
</section>`;
  }

  function funding(ctx) {
    const { c } = ctx;
    const cp = c.campaign;
    const snap = fundingSnapshot(cp);
    const cur = cp.reportingCurrency;
    const scope = cp.scopeLabel;
    const head = `<div class="section-head"><p class="eyebrow">${ctx.v(scope, 'CAMPAIGN_SCOPE', 'e.g. “Roof phase appeal”')}</p><h2 id="funding-h">Funding for this phase</h2></div>`;
    const stage = `<div class="funding-aside">
        <h3>Construction status is reported separately</h3>
        <p>Current stage: <strong>${ctx.v(c.status.currentStage, 'CURRENT_STAGE')}</strong></p>
        <p class="muted">The share of money raised is not the same as the share of construction completed.</p>
        ${Number.isInteger(cp.totalProjectBudget)
          ? `<p class="budget">Estimated total project budget: <strong>${ctx.dual(cp.totalProjectBudget, cur, { approx: true })}</strong>${cp.totalProjectBudgetAsOf ? ` <span class="muted">(estimate as of ${esc(ctx.date(cp.totalProjectBudgetAsOf))})</span>` : ''}. This appeal covers ${scope ? 'the ' + esc(scope.toLowerCase()) : 'the current phase'} only.</p>`
          : (ctx.P ? `<p class="budget">${ctx.ph('TOTAL_PROJECT_BUDGET', 'Optional: shown separately from the current appeal')}</p>` : '')}
        <p><a class="text-link" href="${ctx.link('transparency')}">How we count donations</a></p>
      </div>`;
    if (!snap && Number.isInteger(cp.currentPhaseTarget)) {
      return `<section id="funding" class="band band-panel" aria-labelledby="funding-h">
  <div class="wrap">
    ${head}
    <div class="funding-grid">
      <div class="funding-figures">
        <dl class="figs">
          <div class="fig fig-main"><dt>Estimated cost of this phase</dt><dd>${ctx.dual(cp.currentPhaseTarget, cur, { approx: true })}</dd></div>
          <div class="fig"><dt>Confirmed raised</dt><dd class="fig-pending">Not yet published</dd></div>
        </dl>
        ${cp.targetNote ? `<p class="bar-caption">${esc(cp.targetNote)}</p>` : ''}
        <p class="fine">The amount raised will be published once it has been reconciled with the bank statements, together with the date it was checked.</p>
        ${ctx.phBlock('CONFIRMED_RAISED · FINANCIAL_AS_OF', 'Add the reconciled amount and date to show the progress bar.')}
      </div>
      ${stage}
    </div>
  </div>
</section>`;
    }
    if (!snap) {
      return `<section id="funding" class="band band-panel" aria-labelledby="funding-h">
  <div class="wrap">
    ${head}
    <div class="funding-grid">
      <div class="funding-figures">
        <p class="funding-pending">Confirmed figures will be published here once they have been reconciled. No total is shown until it can be checked.</p>
        ${ctx.phBlock('CURRENT_PHASE_TARGET · CONFIRMED_RAISED · FINANCIAL_AS_OF', 'The progress bar appears only when all three are verified. Until then this honest message is shown instead of a zero.')}
      </div>
      ${stage}
    </div>
  </div>
</section>`;
    }
    const m = (x) => ctx.dual(x, cur, { approx: true });
    return `<section id="funding" class="band band-panel" aria-labelledby="funding-h">
  <div class="wrap">
    ${head}
    <div class="funding-grid">
      <div class="funding-figures">
        <dl class="figs">
          <div class="fig fig-main"><dt>Confirmed raised</dt><dd class="num">${m(snap.raised)}</dd></div>
          <div class="fig"><dt>Phase target</dt><dd class="num">${m(snap.target)}</dd></div>
          <div class="fig"><dt>Still needed</dt><dd class="num">${m(snap.remaining)}</dd></div>
        </dl>
        <svg class="bar" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect class="bar-track" width="100" height="12"/><rect class="bar-fill" width="${Math.max(snap.pct, 1)}" height="12"/></svg>
        <p class="bar-caption"><strong>${snap.pct}%</strong> of the ${scope ? esc(scope.toLowerCase()) : 'phase'} target raised. Reconciled by hand on <time datetime="${esc(cp.financialAsOf)}">${esc(ctx.date(cp.financialAsOf))}</time>; this is not a live total.</p>
        ${cp.figureSource ? `<p class="fine">Source: ${esc(cp.figureSource)}</p>` : (ctx.P ? `<p class="fine">${ctx.ph('FIGURE_SOURCE')}</p>` : '')}
      </div>
      ${stage}
    </div>
  </div>
</section>`;
  }

  function buildingToday(ctx) {
    const bt = ctx.c.buildingToday || {};
    const photos = (bt.photos || []).slice(0, 6);
    const dz = ctx.c.design;
    if (!ctx.P && !photos.some((p) => p.src) && !bt.summary && !dz) return '';
    const designHtml = dz ? `
    <div class="design">
      <div class="design-head">
        <h3 class="sub-h">${esc(dz.title || 'The planned building')}</h3>
        ${dz.architect ? `<p class="muted">Design by ${esc(dz.architect)}. These are the architect's concept and plans, not photographs of the building.</p>` : ''}
      </div>
      <div class="design-top">
        ${dz.concept ? `<div class="design-concept">${photo(ctx, dz.concept, { sizes: '(min-width: 1000px) 700px, 100vw' })}</div>` : ''}
        <div class="design-facts">
          ${(dz.facts || []).length ? `<dl class="facts">${dz.facts.map((x) => `<div><dt>${esc(x.label)}</dt><dd class="num">${esc(x.value)}</dd></div>`).join('')}</dl>` : ''}
          ${(dz.areas || []).length ? `<table class="areas"><caption class="vh">Planned floor areas</caption><thead><tr><th scope="col">Area</th><th scope="col" class="r">Size</th></tr></thead>${dz.areas.map((ar) => `<tbody><tr class="floor-row"><th scope="rowgroup" colspan="2">${esc(ar.floor)}</th></tr>${ar.items.map(([k, x]) => `<tr><th scope="row">${esc(k)}</th><td class="r num">${esc(x)}</td></tr>`).join('')}</tbody>`).join('')}</table>` : ''}
        </div>
      </div>
      <ul class="plan-grid" role="list">${(dz.images || []).map((im) => `<li>${photo(ctx, im)}</li>`).join('')}</ul>
    </div>` : '';
    let grid = '';
    if (!ctx.P && !photos.some((p) => p.src && !p.placeholder)) {
      grid = '';
    } else if (photos.length) {
      grid = photos.map((p) => `<li>${photo(ctx, p)}</li>`).join('');
    } else {
      grid = ['The site from the street', 'Foundation work in progress', 'Close-up of completed work']
        .map((h) => `<li>${photo(ctx, null, { hint: h })}</li>`).join('');
    }
    return `<section id="project" class="band" aria-labelledby="project-h">
  <div class="wrap">
    <div class="section-head split">
      <div><p class="eyebrow">${ctx.c.site.siteName ? 'The masjid project' : 'The project'}</p><h2 id="project-h">The site today and the plans</h2></div>
      <p class="section-intro">${ctx.v(bt.summary, 'BUILDING_SUMMARY', 'What visitors can see in the photos, and what remains to be built')}</p>
    </div>
    ${grid && ctx.c.site.siteName ? '<h3 class="sub-h site-today-h">The site today</h3>' : ''}
    ${grid ? `<ul class="photo-grid site-photos" role="list" data-count="${photos.length || 3}">${grid}</ul>` : ''}
    ${designHtml}
  </div>
</section>`;
  }

  function needs(ctx) {
    const list = (ctx.c.needs || []).slice(0, 3);
    const cur = ctx.c.campaign.reportingCurrency;
    if (!list.length && !ctx.P) return '';
    const card = (n, i) => `<article class="need${i === 0 ? ' need-primary' : ''}">
        ${i === 0 ? '<p class="need-tag">Next priority</p>' : ''}
        <h3>${esc(n.title)}</h3>
        ${n.why ? `<p>${esc(n.why)}</p>` : ''}
        <dl class="need-meta">
          <div><dt>Estimate</dt><dd>${Number.isInteger(n.estimate) ? ctx.dual(n.estimate, cur, { approx: true }) : 'To be confirmed'}${n.estimateNote ? `<span class="need-note">${esc(n.estimateNote.charAt(0).toUpperCase() + n.estimateNote.slice(1))}</span>` : ''}</dd></div>
          <div><dt>Status</dt><dd>${esc(n.status || 'To be confirmed')}</dd></div>
        </dl>
      </article>`;
    const body = list.length
      ? `<div class="needs-grid" data-count="${list.length}">${list.map(card).join('')}</div>`
      : ctx.phBlock('NEXT_MILESTONE · NEEDS', 'The next priority, then up to two other verified needs. Each: the work, why it matters, estimate if known, status. No invented estimates or dates.');
    const cb = ctx.c.campaign.costBreakdown || [];
    const cbTotal = cb.reduce((t, r) => t + (Number.isInteger(r.cost) ? r.cost : 0), 0);
    const breakdown = cb.length ? `
    <div class="breakdown" tabindex="0" role="region" aria-label="Cost breakdown table">
      <table>
        <caption><span class="cap-h">Foundation materials: estimated costs</span>${ctx.c.campaign.costBreakdownSource ? `<span class="fine">${esc(ctx.c.campaign.costBreakdownSource)}</span>` : ''}</caption>
        <thead><tr><th scope="col">Material</th><th scope="col">Quantity</th><th scope="col" class="r">${ctx.dc && cur === ctx.dc.sourceCurrency ? 'Estimated cost (€ approx.)' : 'Estimated cost'}</th></tr></thead>
        <tbody>${cb.map((r) => `<tr><th scope="row">${esc(r.item)}</th><td>${r.quantity ? esc(r.quantity) : '<span class="muted">Not stated</span>'}${r.gift && ctx.dc && cur === ctx.dc.sourceCurrency ? (() => { const per = r.gift.displayPer || 1; const amt = formatMoney(MW.roundFriendly(r.cost * per / r.gift.units / 100 / ctx.dc.rate) * 100, ctx.dc.code, ctx.dc.locale || ctx.numLocale, { compact: true }); return `<span class="unit-cost">≈ ${esc(amt)} ${per > 1 ? `per ${per} ${esc(r.gift.unitPlural)}` : `a ${esc(r.gift.unit)}`}</span>`; })() : ''}</td><td class="r">${Number.isInteger(r.cost) ? ctx.dual(r.cost, cur) : '—'}</td></tr>`).join('')}</tbody>
        <tfoot><tr><th scope="row" colspan="2">Total for materials</th><td class="r">${ctx.dual(cbTotal, cur)}</td></tr></tfoot>
      </table>
      ${ctx.c.campaign.targetNote ? `<p class="fine">${esc(ctx.c.campaign.targetNote)}</p>` : ''}
      ${ctx.rateNote()}
    </div>` : '';
    const alloc = ctx.c.campaign.allocationNote;
    return `<section id="needs" class="band band-tint" aria-labelledby="needs-h">
  <div class="wrap">
    <div class="section-head"><p class="eyebrow">Where donations go</p><h2 id="needs-h">What we need next</h2></div>
    <div class="needs-layout${breakdown && list.length === 1 ? ' needs-split' : ''}">
    ${body}
    ${breakdown}
    </div>
    <p class="alloc">${alloc ? esc(alloc) : (ctx.P ? ctx.ph('FUND_ALLOCATION', 'Approved wording, e.g. one general construction fund applied to the current priority first') : '')}</p>
  </div>
</section>`;
  }

  function progress(ctx) {
    const ms = ctx.c.milestones || [];
    const ups = (ctx.c.updates || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 3);
    if (!ms.length && !ups.length && !ctx.P) return '';
    const msHtml = ms.length ? `<ol class="timeline">${ms.map((m) => `
        <li class="ms ms-${esc(m.status)}">
          <span class="ms-marker">${msIcon(m.status)}</span>
          <div class="ms-body">
            <p class="ms-status">${esc(MS_LABEL[m.status] || m.status)}</p>
            <h3>${esc(m.title)}</h3>
            <p class="ms-date">${m.date ? `${m.dateType === 'estimate' ? 'Estimated: ' : ''}<time datetime="${esc(m.date)}">${esc(ctx.date(m.date))}</time>` : 'Date to be confirmed'}</p>
            ${m.description ? `<p class="ms-desc">${esc(m.description)}</p>` : ''}
          </div>
        </li>`).join('')}</ol>`
      : ctx.phBlock('MILESTONES', 'Completed, in-progress and planned stages with actual or clearly labelled estimated dates.');
    const upHtml = ups.length ? `<div class="updates">${ups.map((u) => `
        <article class="update">
          ${photo(ctx, u.photo, { hint: 'Photo from this update' })}
          <div class="update-body">
            <p class="update-date"><time datetime="${esc(u.date)}">${esc(ctx.date(u.date))}</time></p>
            <h3>${esc(u.title)}</h3>
            <p>${esc(u.body)}</p>
            ${u.next ? `<p class="update-next"><span>Next step:</span> ${esc(u.next)}</p>` : ''}
          </div>
        </article>`).join('')}</div>`
      : ctx.phBlock('UPDATES', 'The three most recent dated updates: photo, work completed, next step.');
    const latest = ups[0] ? `<p class="section-intro">Latest update published <time datetime="${esc(ups[0].date)}">${esc(ctx.date(ups[0].date))}</time>.</p>` : '';
    return `<section id="progress" class="band" aria-labelledby="progress-h">
  <div class="wrap">
    <div class="section-head split"><div><p class="eyebrow">Progress</p><h2 id="progress-h">Construction timeline</h2></div>${latest}</div>
    <div class="progress-grid">
      <div>${msHtml}</div>
      <div><h3 class="sub-h">Latest updates</h3>${upHtml}${ctx.c.contact && ctx.c.contact.facebook ? `
        <div class="fb-follow">${FB}<div><p class="fb-follow-h">Follow the construction on Facebook</p><p>For the latest news and photos from the site, visit the Jamia's Facebook page.</p><a class="btn btn-secondary" href="${esc(MW.safeUrl(ctx.c.contact.facebook))}" rel="noopener noreferrer">See updates on Facebook</a></div></div>` : ''}</div>
    </div>
  </div>
</section>`;
  }

  const DEPT_ICONS = {
    Academic: '<path d="M4 6.5 12 3l8 3.5-8 3.5z"/><path d="M7 8.2v4.3c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V8.2"/><path d="M20 6.5v5"/>',
    'Religious services': '<path d="M5 4h10l4 4v12H5z"/><path d="M15 4v4h4"/><path d="M8 12h8M8 15.5h8"/>',
    'Student welfare': '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M12 17.5s-3-1.7-3-3.6a1.6 1.6 0 0 1 3-.8 1.6 1.6 0 0 1 3 .8c0 1.9-3 3.6-3 3.6z"/>',
  };

  function about(ctx) {
    const { c, org } = ctx;
    const st = c.story || {};
    const paras = st.paragraphs || [];
    if (!paras.length && !ctx.P) return '';
    const original = st.missionUr ? `<figure class="mission"><blockquote class="ur-quote" lang="ur" dir="rtl"><p>${esc(st.missionUr)}</p></blockquote>${st.translationNote ? `<figcaption class="fine">The Jamia's statement of purpose, in Urdu. ${esc(st.translationNote)}${ctx.P && !st.translationConfirmed ? ' ' + ctx.ph('TRANSLATION_REVIEW', 'The Jamia should confirm the English wording') : ''}</figcaption>` : ''}</figure>` : '';
    const story = paras.length ? paras.map((p) => `<p>${esc(p)}</p>`).join('')
      : ctx.phBlock('PROJECT_STORY', 'A few approved paragraphs: who the masjid serves, why the building is needed, who is responsible.');
    const facts = (st.facts || []).length ? `<dl class="jamia-facts">${st.facts.map((x) => `<div><dt>${esc(x.label)}</dt><dd>${Number.isInteger(x.amountPkr) ? `${ctx.dual(x.amountPkr, 'PKR', { approx: true })}${x.suffix ? `<span class="fact-suffix">${esc(x.suffix)}</span>` : ''}` : esc(x.value)}</dd></div>`).join('')}</dl>` : '';
    let n = 0;
    const depts = (st.departments || []).length ? `
    <div class="depts-block">
      <div class="depts-head">
        <h3 class="sub-h">Academic and administrative departments</h3>
        <p class="muted">The Jamia's ${['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'][st.departments.reduce((t, g) => t + g.items.length, 0)] || st.departments.reduce((t, g) => t + g.items.length, 0)} departments, as listed in its introduction.</p>
      </div>
      <div class="dept-groups">${st.departments.map((g) => `
        <section class="dept-group" aria-labelledby="dg-${esc(g.group.toLowerCase().replace(/[^a-z]+/g, '-'))}">
          <header class="dept-group-head">
            <svg class="dept-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${DEPT_ICONS[g.group] || DEPT_ICONS.Academic}</svg>
            <h4 id="dg-${esc(g.group.toLowerCase().replace(/[^a-z]+/g, '-'))}">${esc(g.group)}</h4>
          </header>
          <ol class="dept-list" role="list">${g.items.map((it) => { n += 1; return `<li><span class="dept-no" aria-hidden="true">${String(n).padStart(2, '0')}</span><span class="dept-text"><span class="dept-name">Department of ${esc(it.name)}</span>${it.note ? `<span class="dept-note">${esc(it.note)}</span>` : ''}</span></li>`; }).join('')}</ol>
        </section>`).join('')}
      </div>
      ${st.departmentsNote && ctx.P ? `<p class="fine">${esc(st.departmentsNote)}</p>` : ''}
    </div>` : '';
    return `<section id="about" class="band band-panel" aria-labelledby="about-h">
  <div class="wrap">
    <div class="section-head split about-head">
      <div><p class="eyebrow">About us</p><h2 id="about-h">${org.name ? esc(org.name) : 'About the project'}</h2></div>
      ${org.nameUr ? `<p class="section-ur" lang="ur" dir="rtl">${esc(org.nameUr)}</p>` : ''}
    </div>
    <div class="about-grid">
      <div class="prose about-story">${story}${original}</div>
      <div class="about-aside">${facts}</div>
    </div>
    ${depts}
  </div>
</section>`;
  }

  function transparency(ctx) {
    const { c, org } = ctx;
    const differentCountry = org.country && c.site.projectCountry && org.country !== c.site.projectCountry;
    const onward = org.onwardTransfer ? `<p>${esc(org.onwardTransfer)}</p>`
      : (differentCountry || (ctx.P && (!org.country || !c.site.projectCountry)))
        ? ctx.phBlock('ONWARD_TRANSFER', 'If the collecting organisation and the masjid are in different countries: how funds are transferred, and any fees or currency conversion, in plain language.')
        : '';
    const dc = c.site.displayCurrency;
    const conversion = c.campaign.currencyConversion ? `<p>${esc(c.campaign.currencyConversion)}</p>`
      : (dc && ctx.P ? ctx.phBlock('CURRENCY_CONVERSION', 'How euro donations reach the Jamia in rupees, and who pays any conversion or transfer fees.') : '');
    const reports = (c.reports || []).filter((r) => r.url || ctx.P);
    const reportsHtml = reports.length ? `<ul class="reports">${reports.map((r) => `<li>${MW.safeUrl(r.url) ? `<a href="${esc(MW.safeUrl(r.url))}">${esc(r.title)}</a>` : esc(r.title) + ' ' + ctx.ph('REPORT_URL')}<span class="muted"> · ${esc(r.period || '')}${r.published ? ', published ' + esc(ctx.date(r.published)) : ''}</span></li>`).join('')}</ul>`
      : (ctx.P ? ctx.phBlock('REPORTS', 'Approved budget summaries, progress reports, registration records. Redact donor and bank details.') : '');
    const pol = c.policies || {};
    return `<section id="transparency" class="band band-tint" aria-labelledby="transparency-h">
  <div class="wrap">
    <div class="section-head"><p class="eyebrow">Transparency</p><h2 id="transparency-h">How your donation is handled</h2></div>
    <div class="trust-grid">
      <article class="trust-card">
        <h3>Who receives your donation</h3>
        <dl class="kv">
          <div><dt>Organisation</dt><dd>${ctx.v(org.name, 'COLLECTING_ORGANISATION_NAME')}</dd></div>
          <div><dt>Based in</dt><dd>${ctx.v(org.country, 'COLLECTING_ORGANISATION_COUNTRY')}</dd></div>
          ${org.registration || ctx.P ? `<div><dt>Registration</dt><dd>${ctx.v(org.registration, 'VERIFIED_REGISTRATION_DETAILS')}</dd></div>` : ''}
          ${org.head ? `<div><dt>Responsible</dt><dd>${esc(org.head.name)}${org.head.role ? `, ${esc(org.head.role)}` : ''}</dd></div>` : ''}
          <div><dt>Relationship to the masjid</dt><dd>${ctx.v(org.relationshipToMasjid, 'RELATIONSHIP_TO_MASJID')}</dd></div>
        </dl>
        ${onward}
      </article>
      <article class="trust-card">
        <h3>How we count donations</h3>
        <p>${esc(c.campaign.totalPolicy)}</p>
        ${pol.fees ? `<p>${esc(pol.fees)}</p>` : (ctx.P ? `<p>${ctx.ph('FEES_EXPLANATION', 'Who charges fees and on what basis. Do not claim 100% reaches construction unless verified.')}</p>` : '')}
        ${dc ? `<p class="muted">Costs are set in Pakistani rupees. Euro figures on this site are approximate conversions for donors in Europe.</p>` : ''}
        ${conversion}
      </article>
      <article class="trust-card">
        <h3>Reports and documents</h3>
        ${reportsHtml || '<p class="muted">Reports will be published here.</p>'}
      </article>
    </div>
  </div>
</section>`;
  }

  function faq(ctx, o) {
    o = o || {};
    const { c, org, payments } = ctx;
    const pol = c.policies || {};
    const provider = ctx.providerName ? esc(ctx.providerName) : (ctx.P ? ctx.ph('PAYMENT_PROVIDER') : 'our payment provider');
    const contact = contactLines(ctx).filter((x) => !x.startsWith('<span>' + esc((ctx.c.contact || {}).person || '\u0000'))).join(' · ');
    const items = [];
    const lead = (t) => `<strong class="faq-lead">${t}</strong> `;
    items.push(['Who receives my donation?', `<p>${lead(ctx.v(org.name, 'COLLECTING_ORGANISATION_NAME') + (org.country ? `, based in ${esc(org.country)}.` : '.'))}${org.relationshipToMasjid ? esc(org.relationshipToMasjid) : ctx.ph('RELATIONSHIP_TO_MASJID')}</p>`]);
    if (ctx.funds.length > 1) {
      items.push(['How will my donation be used?', `<p>${lead('For the cause you choose.')}Gifts to “${esc(ctx.funds[0].name)}” pay for building Jamia Masjid Syeda Amina R.A., starting with the foundation. Gifts to “${esc(ctx.funds[1].name)}” pay for the students' meals and accommodation.${ctx.P && !c.fundsSeparateConfirmed ? ' ' + ctx.ph('FUND_SEPARATION') : ''}</p>`]);
    } else {
      items.push(['How will my donation be used?', `<p>${c.campaign.allocationNote ? esc(c.campaign.allocationNote) : (ctx.P ? ctx.ph('FUND_ALLOCATION') : 'For the construction of the masjid, starting with the priority listed on this page.')}</p>`]);
    }
    if (ctx.dc) items.push(['Can I give from Europe?', `<p>${lead('Yes.')}You can give online in euros${bankAvailable(ctx) ? `, or send an <a href="${ctx.link('home', 'bank-transfer')}">international bank transfer</a> from your own bank` : ''}. Costs in Pakistan are paid in rupees, so euro figures on this site are approximate.</p>`]);
    items.push(['How do I give online?', `<p>${lead('Through a secure payment page.')}You pay on ${provider}'s page, which shows the payment methods available to you. ${(payments.methods || []).length ? 'Available methods: ' + esc(payments.methods.join(', ')) + '. ' : ''}This website never receives your card or bank details.</p>`]);
    items.push(['Will I get a confirmation?', `<p>${lead('Yes.')}The payment provider sends your confirmation, usually by email. Returning to this website does not confirm a payment, because the site cannot see individual payments. If you are unsure whether a payment went through, please check with us before trying again: ${contact}</p>`]);
    if (pol.zakatGuidanceVerified) items.push(['Can I give Zakat?', `<p>${lead(esc(pol.zakatLead || 'Yes.'))}${esc(pol.zakatGuidanceVerified)}</p>`]);
    if (payments.recurring && payments.recurring.enabled) {
      items.push(['Can I stop a monthly donation?', `<p>${lead('Yes, at any time.')}${ctx.v(payments.recurring.cancellation, 'RECURRING_POLICY')}</p>`]);
    }
    if (pol.refund || ctx.P) items.push(['What if I made a mistake or need a refund?', `<p>${lead('Contact us as soon as possible.')}${pol.refund ? esc(pol.refund) : ctx.ph('REFUND_POLICY')} You can reach us at: ${contact}</p>`]);
    else items.push(['What if I made a mistake?', `<p>${lead('Contact us as soon as possible.')}${contact}</p>`]);
    if (pol.surplusAndDelays || ctx.P) items.push(['What happens if the work is delayed or the phase is over-funded?', `<p>${ctx.v(pol.surplusAndDelays, 'SURPLUS_POLICY')}</p>`]);
    if (pol.taxReliefVerified) items.push(['Can I claim tax relief?', `<p>${esc(pol.taxReliefVerified)}</p>`]);
    const missingElig = [!pol.taxReliefVerified && 'TAX_RELIEF', !pol.zakatGuidanceVerified && 'ZAKAT'].filter(Boolean);
    const hiddenNote = missingElig.length
      ? ctx.phBlock(missingElig.join(' · '), `No question about ${missingElig.includes('TAX_RELIEF') ? 'tax relief' : ''}${missingElig.length === 2 ? ' or ' : ''}${missingElig.includes('ZAKAT') ? 'Zakat' : ''} is shown until the facts are verified and approved.`) : '';
    items.push(['How can I contact you?', `<p class="stack">${contactLines(ctx).join('')}</p>`]);
    if (o.only) {
      // Home page: a short selection, in the order given, with a link to the full list.
      const picked = o.only.map((q) => items.find(([iq]) => iq === q)).filter(Boolean);
      if (!picked.length) return '';
      return `<section id="home-faq" class="band home-faq" aria-labelledby="home-faq-h">
  <div class="wrap">
    <div class="section-head split"><div><p class="eyebrow">Questions</p><h2 id="home-faq-h">Before you give</h2></div><p class="section-intro">The questions donors ask most often. <a class="text-link" href="${ctx.link('transparency', 'faq')}">See all questions</a></p></div>
    <div class="faq faq-grid">${picked.map(([q, a]) => `<details><summary>${q}</summary><div class="faq-a">${a}</div></details>`).join('')}</div>
  </div>
</section>`;
    }
    return `<section id="faq" class="band" aria-labelledby="faq-h">
  <div class="wrap narrow">
    <div class="section-head"><p class="eyebrow">Questions</p><h2 id="faq-h">Before you give</h2></div>
    <div class="faq">${items.map(([q, a]) => `<details><summary>${q}</summary><div class="faq-a">${a}</div></details>`).join('')}</div>
    ${hiddenNote}
  </div>
</section>`;
  }

  function appeal(ctx) {
    const url = ctx.c.site.canonicalUrl || '';
    return `<section id="share" class="appeal" aria-labelledby="appeal-h">
  <div class="wrap appeal-inner">
    <div>
      <h2 id="appeal-h">Help us reach the next stage</h2>
      <p>${ctx.c.appealClosing && ctx.c.appealClosing.en ? esc(ctx.c.appealClosing.en) : (ctx.c.campaign.scopeLabel ? 'Your donation goes toward the ' + esc(ctx.c.campaign.scopeLabel.toLowerCase()) + '.' : 'Every donation helps move the build forward.')} Sharing this page with someone who might help counts too.</p>
      ${ctx.c.appealClosing && ctx.c.appealClosing.ar ? `<p class="appeal-ar"><span lang="ar" dir="rtl">${esc(ctx.c.appealClosing.ar)}</span>${ctx.c.appealClosing.arMeaning ? `<span class="appeal-ar-meaning">${esc(ctx.c.appealClosing.arMeaning)}</span>` : ''}</p>` : ''}
    </div>
    <div class="appeal-actions">
      <a class="btn btn-light btn-lg" href="${ctx.link('donate')}">Donate Now</a>
      <div class="share" data-share>
        <button type="button" class="btn btn-ghost-light btn-lg" data-copy>Copy link to share</button>
        <label class="vh" for="share-url">Page link</label>
        <input id="share-url" class="share-url" type="text" readonly value="${esc(url)}" data-share-url>
        <p class="share-status" role="status" data-share-status></p>
      </div>
    </div>
  </div>
</section>`;
  }


  // ---------------------------------------------------------------------------
  // Bank transfer (international wire + local wallet)
  // ---------------------------------------------------------------------------
  const groupIban = (x) => String(x).replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();

  function bankAvailable(ctx) {
    const bt = ctx.f.bankTransfer || {};
    const n = (bt.accounts || []).length + (bt.mobileWallets || []).length;
    return n > 0 && (bt.verified === true || ctx.P);
  }

  function bankTransfer(ctx, o) {
    o = o || {};
    const bt = ctx.f.bankTransfer || {};
    if (!bankAvailable(ctx)) return '';
    const pending = bt.verified !== true;
    const id = o.id || 'bank-transfer';
    const copyCell = (label, value, display) => value
      ? `<span class="acct-val">${esc(display || value)}</span><button type="button" class="copy-btn" data-copy-value="${esc(String(value).replace(/\s+/g, ''))}" aria-label="Copy ${label}">Copy</button>`
      : '<span class="muted">Not shown</span>';
    const flagsFor = (a) => {
      if (!pending) return [];
      const fl = [];
      if (!a.accountTitle) fl.push('account title not on the posters');
      if (a.holderType === 'individual') fl.push("held in an individual's name");
      else if (!a.holderType) fl.push('confirm it belongs to the Jamia');
      if (a.swift) fl.push('head-office SWIFT used');
      return fl;
    };
    // One table per account, so every detail of a bank sits together.
    const valueRow = (label, value, display) => `<tr><th scope="row">${label}</th><td><span class="acct-val">${esc(display || value)}</span></td><td class="copy-cell"><button type="button" class="copy-btn" data-copy-value="${esc(String(value).replace(/\s+/g, ''))}" aria-label="Copy ${label}">Copy</button></td></tr>`;
    const textRow = (label, html) => `<tr><th scope="row">${label}</th><td colspan="2">${html}</td></tr>`;
    let n = 0;
    const bankCard = (a, local) => {
      n += 1;
      const fl = flagsFor(local ? { ...a, swift: null } : a);
      const rowsHtml = local
        ? [a.accountTitle ? valueRow('Account title', a.accountTitle) : '', valueRow('Wallet number', a.number)].join('')
        : [
          a.accountTitle ? valueRow('Beneficiary name', a.accountTitle) : textRow('Beneficiary name', ctx.ph('ACCOUNT_TITLE')),
          a.iban ? valueRow('IBAN', a.iban, groupIban(a.iban)) : '',
          a.accountNumber ? valueRow('Account number', a.accountNumber) : '',
          a.swift ? valueRow('SWIFT/BIC', a.swift) : '',
          textRow('Bank name', `${esc(a.bank)}${a.branch ? `, ${esc(a.branch)}` : ''}`),
        ].join('');
      const hid = `${id}-acct${n}`;
      return `<div class="bank-card${local ? ' bank-local' : ''}">
          <header class="bank-head">
            <span class="bank-no" id="${hid}-no">${local ? 'Pakistan only' : 'Account ' + n}</span>
            <h3 class="bank-name" id="${hid}">${esc(local ? a.provider : a.bank)}</h3>
            <span class="bank-sub">${esc(local ? (a.scope || 'Mobile wallet') : (a.branch || 'Pakistan'))}</span>
          </header>
          <table class="bank-table" aria-labelledby="${hid}-no ${hid}"><tbody>${rowsHtml}</tbody></table>
          ${fl.length ? `<p class="acct-flag">Check before launch: ${esc(fl.join('; '))}</p>` : ''}
        </div>`;
    };
    const cards = (bt.accounts || []).map((a) => bankCard(a, false)).join('') + (bt.mobileWallets || []).map((w) => bankCard(w, true)).join('');
    const reference = bt.reference ? `<strong>${esc(bt.reference)}</strong>` : (ctx.P ? ctx.ph('TRANSFER_REFERENCE', 'Short reference the Jamia will recognise, e.g. the masjid name') : 'the masjid’s name');
    const phones = ctx.c.contact && ctx.c.contact.phone ? String(ctx.c.contact.phone).split(/\s*[·,;\/]\s*/).filter(Boolean).map((n) => `<a href="tel:${esc(n.replace(/[^+\d]/g, ''))}" class="phone-n">${esc(n)}</a>`).join(' or ') : (ctx.P ? ctx.ph('VERIFIED_CONTACT') : '');
    const pendingNote = pending ? `<p class="wire-pending"><span class="ph-tag">Pending verification</span> Copied from the Jamia's posters. Hidden on the live site until the finance owner confirms each account with the bank.</p>` : '';
    return `<section class="wire" id="${id}" aria-labelledby="${id}-h">
  <div class="wire-head">
    <div><h2 class="sub-h" id="${id}-h">Give by bank transfer</h2><p class="muted">From Europe, send an international (SWIFT) transfer in euros. Pakistan is not in the SEPA area.</p></div>
    ${pendingNote}
  </div>
  <ol class="wire-steps">
    <li><span><strong>Choose an international transfer</strong> in your banking app.</span></li>
    <li><span><strong>Copy the name, IBAN and SWIFT/BIC</strong> exactly as shown.</span></li>
    <li><span><strong>Add the reference</strong> ${reference}.</span></li>
    <li><span><strong>Let us know</strong> you have sent it${phones ? `: ${phones}` : ''}.</span></li>
  </ol>
  <div class="bank-grid">${cards}</div>
  <p class="fine wire-fine">Your bank and intermediary banks may charge fees, so the amount received can be lower than the amount sent. The receiving bank converts euros to Pakistani rupees. Transfers are added to the published total only after they appear on the bank statement.</p>
  <p class="copy-status" role="status" data-copy-status></p>
</section>`;
  }

  function glance(ctx) {
    const { c } = ctx;
    const cards = [];
    const arrow = '<span aria-hidden="true">\u00a0→</span>';
    if (Number.isInteger(c.campaign.currentPhaseTarget)) cards.push(`<article class="glance-card">
        <p class="glance-k">The masjid</p>
        <h3>Foundation materials needed</h3>
        <p class="glance-v">${ctx.dual(c.campaign.currentPhaseTarget, c.campaign.reportingCurrency, { approx: true })}</p>
        <p class="glance-d">Steel, cement, blocks, stone, sand and aggregate for the foundation.</p>
        <a class="glance-link" href="${ctx.link('masjid')}">See the plans and costs${arrow}</a>
      </article>`);
    if (c.studentCost && c.studentCost.annualPkrMinor) cards.push(`<article class="glance-card">
        <p class="glance-k">The students</p>
        <h3>A student's food and board for a year</h3>
        <p class="glance-v">${ctx.dual(c.studentCost.annualPkrMinor, 'PKR', { approx: true })}</p>
        <p class="glance-d">Every student receives meals and accommodation free of charge.</p>
        <a class="glance-link" href="${ctx.link('about')}">About us${arrow}</a>
      </article>`);
    const done = (c.milestones || []).filter((m) => m.status === 'completed' && m.date);
    cards.push(`<article class="glance-card">
        <p class="glance-k">Progress</p>
        <h3>Current stage</h3>
        <p class="glance-v glance-text">${ctx.v(c.status.currentStage, 'CURRENT_STAGE')}</p>
        <p class="glance-d">${done.length ? `${esc(done[0].title)} on ${esc(ctx.date(done[0].date))}.` : 'Dated updates are published as work continues.'}</p>
        <a class="glance-link" href="${ctx.link('progress')}">See the timeline${arrow}</a>
        ${c.contact && c.contact.facebook ? `<a class="glance-link glance-link-2" href="${esc(MW.safeUrl(c.contact.facebook))}" rel="noopener noreferrer">Updates on Facebook${arrow}</a>` : ''}
      </article>`);
    if (bankAvailable(ctx)) cards.push(`<article class="glance-card">
        <p class="glance-k">Bank transfer</p>
        <h3>Give from your own bank</h3>
        <p class="glance-v glance-text">IBAN and SWIFT</p>
        <p class="glance-d">Send an international transfer from Europe to the Jamia's accounts in Pakistan.</p>
        <a class="glance-link" href="${ctx.link('home', 'bank-transfer')}">Bank details${arrow}</a>
      </article>`);
    return `<section class="band band-panel glance" aria-labelledby="glance-h">
  <div class="wrap">
    <div class="section-head"><p class="eyebrow">At a glance</p><h2 id="glance-h">Where your support goes</h2></div>
    <div class="glance-grid" data-count="${cards.length}">${cards.join('')}</div>
    ${ctx.dc ? ctx.rateNote() : ''}
  </div>
</section>`;
  }

  function homeView(ctx) {
    const bank = bankTransfer(ctx, { id: 'bank-transfer' });
    return [hero(ctx), bank ? `<div class="band band-panel home-bank"><div class="wrap">${bank}</div></div>` : '', glance(ctx), faq(ctx, { only: ['Who receives my donation?', 'How will my donation be used?', 'Can I give Zakat?', 'Can I give from Europe?'] }), appeal(ctx)].join('\n');
  }

  // The Masjid page: a large concept gallery, then the master plan with its key and the floor plans,
  // then the masjid's figures. Every drawing opens larger when tapped.
  function plansSection(ctx) {
    const pl = ctx.c.planning || {};
    const dz = ctx.c.design;
    const renders = pl.renders || [];
    const gallery = renders.length ? `
      <ul class="concept-gallery" role="list" data-count="${renders.length}">${renders.map((r, i) => `<li class="cg-${i === 0 ? 'main' : 'side'}">${photo(ctx, r, { zoom: 'plans', sizes: i === 0 ? '(min-width: 1000px) 760px, 100vw' : '(min-width: 1000px) 380px, 50vw' })}</li>`).join('')}</ul>` : '';
    const figures = dz ? `
      <div class="plans-figures">
        <h3 class="sub-h">${esc(dz.title || 'The planned masjid')}</h3>
        ${(dz.facts || []).length ? `<dl class="facts">${dz.facts.map((x) => `<div><dt>${esc(x.label)}</dt><dd class="num">${esc(x.value)}</dd></div>`).join('')}</dl>` : ''}
        ${(dz.areas || []).length ? `<table class="areas"><caption class="vh">Planned floor areas</caption><thead><tr><th scope="col">Area</th><th scope="col" class="r">Size</th></tr></thead>${dz.areas.map((ar) => `<tbody><tr class="floor-row"><th scope="rowgroup" colspan="2">${esc(ar.floor)}</th></tr>${ar.items.map(([k, x]) => `<tr><th scope="row">${esc(k)}</th><td class="r num">${esc(x)}</td></tr>`).join('')}</tbody>`).join('')}</table>` : ''}
      </div>` : '';
    const drawings = `
      <div class="plans-drawings">
        ${pl.masterPlan ? `<div class="pd-master"><h3 class="sub-h">Campus master plan</h3>${photo(ctx, pl.masterPlan, { zoom: 'plans', sizes: '280px' })}</div>` : ''}
        ${campusKey(pl)}
        ${figures}
      </div>
      ${dz && (dz.images || []).length ? `<div class="plans-floors"><h3 class="sub-h">Floor plans of the masjid</h3><ul class="plan-grid" role="list">${dz.images.map((im) => `<li>${photo(ctx, im, { zoom: 'plans', sizes: '(min-width: 1000px) 380px, 33vw' })}</li>`).join('')}</ul></div>` : ''}`;
    if (!gallery && !figures) return '';
    return `<section id="plans" class="band plans-band" aria-labelledby="plans-h">
  <div class="wrap">
    <div class="plans-row-head"><h2 id="plans-h">From plan to building</h2><p class="muted">Concept views, master plan and floor plans${dz && dz.architect ? ' by ' + esc(String(dz.architect).split(' (')[0]) : ''}. Designs, not photographs. Tap any image to see it larger.</p></div>
    ${gallery}
    ${drawings}
  </div>
</section>`;
  }

  function masjidView(ctx) {
    const c = ctx.c;
    return pageTitle(ctx.project || 'The Masjid') + [funding(ctx), needs(ctx), plansSection(ctx)].join('\n');
  }

  function siteFromAbove(ctx) {
    const si = ctx.c.siteImagery;
    if (!si || !(si.images || []).length) return '';
    const imgs = si.images;
    const last = imgs.length - 1;
    return `<section id="from-above" class="band band-panel" aria-labelledby="from-above-h">
  <div class="wrap">
    <div class="section-head split"><div><p class="eyebrow">Satellite views</p><h2 id="from-above-h">The site from above</h2></div><p class="section-intro">The same plot seen from above over the years. Choose a year to compare.</p></div>
    <div class="sat">
      ${imgs.map((im, i) => `<input type="radio" class="sat-r" name="sat-year" id="sat-${i}" value="${i}"${i === last ? ' checked' : ''}>`).join('')}
      <div class="sat-tabs" role="group" aria-label="Choose a year">${imgs.map((im, i) => `<label for="sat-${i}" class="sat-tab">${esc(im.label)}</label>`).join('')}</div>
      <div class="sat-frames">${imgs.map((im, i) => `
        <figure class="sat-f sat-f${i}">
          <img src="${esc(ctx.asset(im.src))}" alt="${esc(im.alt)}" width="${esc(im.width)}" height="${esc(im.height)}" loading="lazy" decoding="async">
          <figcaption><strong>${esc(im.label)}</strong> · Satellite image${si.source ? ' · ' + esc(si.source) : ''}</figcaption>
        </figure>`).join('')}
      </div>
    </div>
  </div>
</section>`;
  }

  function planningGallery(ctx) {
    const pl = ctx.c.planning;
    if (!pl) return '';
    return `<section id="plans" class="band" aria-labelledby="plans-h">
  <div class="wrap">
    <div class="section-head split"><div><p class="eyebrow">Planning</p><h2 id="plans-h">From plan to building</h2></div><p class="section-intro">The campus master plan and the architect's concept views of the masjid. These are designs, not photographs. <a class="text-link" href="${ctx.link('masjid')}">See the floor plans</a></p></div>
    <div class="plans-grid">
      ${pl.masterPlan ? `<div class="plans-master">${photo(ctx, pl.masterPlan, { sizes: '(min-width: 1000px) 380px, 100vw' })}
        ${(pl.buildings || []).length ? `<div class="plans-list"><p class="plans-list-h">In the master plan</p><ul>${pl.buildings.map((b) => `<li>${esc(b)}</li>`).join('')}</ul></div>` : ''}
      </div>` : ''}
      <ul class="plans-renders" role="list" tabindex="0" aria-label="Concept views, scroll sideways">${(pl.renders || []).map((r) => `<li>${photo(ctx, r)}</li>`).join('')}</ul>
    </div>
  </div>
</section>`;
  }

  // Satellite views by year: pick a year with the buttons (works without JavaScript).
  function satViewer(ctx) {
    const si = ctx.c.siteImagery;
    if (!si || !(si.images || []).length) return '';
    const imgs = si.images;
    const last = imgs.length - 1;
    return `<div class="sat sat-years">
      <div class="sat-top"><h3 class="sub-h" id="from-above-h">The site from above</h3>
      ${imgs.map((im, i) => `<input type="radio" class="sat-r" name="sat-year" id="sat-${i}" value="${i}"${i === last ? ' checked' : ''}>`).join('')}
      <div class="sat-tabs" role="group" aria-labelledby="from-above-h">${imgs.map((im, i) => `<label for="sat-${i}" class="sat-tab">${esc(im.label)}</label>`).join('')}</div></div>
      <div class="sat-frames">${imgs.map((im, i) => `
        <figure class="sat-f sat-f${i}">
          <img src="${esc(ctx.asset(im.src))}" alt="${esc(im.alt)}" width="${esc(im.width)}" height="${esc(im.height)}" loading="${i === last ? 'eager' : 'lazy'}" decoding="async">
          <figcaption><strong>${esc(im.label)}</strong> · Satellite image${si.source ? ' · ' + esc(si.source) : ''}</figcaption>
        </figure>`).join('')}
      </div>
    </div>`;
  }

  // Real photographs from the site, oldest first; each opens the full-size image.
  function sitePhotoStrip(ctx) {
    const ps = ((ctx.c.buildingToday || {}).photos || []).filter((p) => p.src && !p.placeholder && p.type !== 'design').slice(0, 4);
    if (!ps.length) return '';
    return `<div class="site-strip">
      <h3 class="sub-h">Photos from the site</h3>
      <ul class="site-strip-list" role="list" data-count="${ps.length}">${ps.map((p) => `
        <li><figure class="photo">
          <a href="${esc(ctx.asset(p.src))}" class="site-strip-link zoom" data-lightbox="site" data-caption="${esc(p.caption || '')}" data-alt="${esc(p.alt || '')}"><img src="${esc(ctx.asset(p.src))}"${p.srcset ? ` srcset="${esc(String(p.srcset).split(',').map((x) => { const [u, w] = x.trim().split(/\s+/); return ctx.asset(u) + ' ' + w; }).join(', '))}" sizes="(min-width: 1000px) 260px, 50vw"` : ''} alt="${esc(p.alt || '')}" width="${esc(p.width)}" height="${esc(p.height)}" loading="lazy" decoding="async"><span class="vh"> (open full-size photo)</span></a>
          <figcaption><span class="photo-cap">${esc(p.caption || '')}</span>${p.date ? ` <time datetime="${esc(p.date)}">${esc(ctx.date(p.date))}</time>` : (ctx.P ? ' ' + ctx.ph('PHOTO_DATE') : '')}</figcaption>
        </figure></li>`).join('')}
      </ul>
    </div>`;
  }

  const KEY_ICONS = {
    dome: '<path d="M4 20h16M6 20v-6a6 6 0 0 1 12 0v6M12 4v4M10 20v-3a2 2 0 0 1 4 0v3"/>',
    book: '<path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5V19c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5zM12 6v13.5"/>',
    home: '<path d="M4 11l8-6 8 6M6 9.5V20h12V9.5M10 20v-5h4v5"/>',
    grid: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
  };
  // The master plan's buildings, grouped by purpose, as a tidy key beside the drawings.
  function campusKey(pl) {
    const groups = (pl.buildingGroups || []).filter((g) => (g.items || []).length);
    if (!groups.length) {
      return (pl.buildings || []).length ? `<div class="plans-list"><p class="plans-list-h">In the master plan</p><ul>${pl.buildings.map((b) => `<li>${esc(b)}</li>`).join('')}</ul></div>` : '';
    }
    const total = groups.reduce((n, g) => n + g.items.length, 0);
    return `<div class="campus-key">
      <p class="campus-key-h"><span>In the master plan</span><span class="campus-key-n">${total} buildings and areas</span></p>
      <ul class="campus-key-list" role="list">${groups.map((g) => `
        <li class="ck-row">
          <span class="ck-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${KEY_ICONS[g.icon] || KEY_ICONS.grid}</svg></span>
          <div><p class="ck-label">${esc(g.label)}</p><ul class="ck-items" role="list">${g.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
        </li>`).join('')}
      </ul>
    </div>`;
  }

  function progressPage(ctx) {
    const c = ctx.c;
    const ms = c.milestones || [];
    const ups = (c.updates || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 3);
    const msHtml = ms.length ? `<ol class="timeline timeline-compact">${ms.map((m) => `
        <li class="ms ms-${esc(m.status)}">
          <span class="ms-marker">${msIcon(m.status)}</span>
          <div class="ms-body">
            <h3><span class="vh">${esc(MS_LABEL[m.status] || m.status)}: </span>${esc(m.title)}</h3>
            <p class="ms-date"><span class="ms-status" aria-hidden="true">${esc(MS_LABEL[m.status] || m.status)}</span> · ${m.date ? `${m.dateType === 'estimate' ? 'Estimated ' : ''}<time datetime="${esc(m.date)}">${esc(ctx.date(m.date))}</time>` : 'Date to be confirmed'}</p>
            ${m.description ? `<p class="ms-desc">${esc(m.description)}</p>` : ''}
          </div>
        </li>`).join('')}</ol>` : ctx.phBlock('MILESTONES', 'Completed, in-progress and planned stages with dates.');
    const upHtml = ups.length ? `<div class="updates updates-compact"><h3 class="sub-h">Latest updates</h3>${ups.map((u) => `
        <article class="update">
          ${photo(ctx, u.photo, { hint: 'Photo from this update' })}
          <div class="update-body">
            <p class="update-date"><time datetime="${esc(u.date)}">${esc(ctx.date(u.date))}</time></p>
            <h4>${esc(u.title)}</h4>
            <p>${esc(u.body)}</p>
            ${u.next ? `<p class="update-next"><span>Next step:</span> ${esc(u.next)}</p>` : ''}
          </div>
        </article>`).join('')}</div>`
      : (ctx.P ? `<p class="field-help">${ctx.ph('UPDATES', 'Dated updates with a photo, the work done and the next step appear here when published.')}</p>` : '');
    const fb = c.contact && c.contact.facebook && MW.safeUrl(c.contact.facebook)
      ? `<div class="fb-follow fb-compact">${FB}<p><strong>Latest news and photos</strong> from the site are on the Jamia's Facebook page.</p><a class="btn btn-secondary" href="${esc(MW.safeUrl(c.contact.facebook))}" rel="noopener noreferrer">See updates on Facebook</a></div>` : '';
    return `<section id="progress" class="band progress-page" aria-labelledby="progress-h">
  <div class="wrap">
    <div class="progress-layout">
      <div class="progress-left">
        <h2 id="progress-h" class="sub-h-lg">Construction timeline</h2>
        ${msHtml}
      </div>
      <div class="progress-right">
        ${satViewer(ctx)}
        ${fb}
      </div>
    </div>
    ${sitePhotoStrip(ctx)}
    ${upHtml}
  </div>
</section>`;
  }

  function progressView(ctx) {
    return pageTitle('Construction progress') + progressPage(ctx);
  }

  function aboutView(ctx) {
    return pageTitle('About us') + about(ctx);
  }

  function transparencyView(ctx) {
    return pageTitle('Transparency and questions') + transparency(ctx) + faq(ctx);
  }

  // ---------------------------------------------------------------------------
  // Other views
  // ---------------------------------------------------------------------------
  // Menu pages: no header band (it only repeated the menu); the h1 stays for screen readers and search engines.
  function pageTitle(text) { return `<h1 class="vh">${esc(text)}</h1>`; }

  function pageHead(ctx, h1, intro, wide) {
    return `<div class="page-head"><div class="wrap${wide ? '' : ' narrow'}"><p class="eyebrow"><a href="${ctx.link('home')}">${esc(ctx.nameText)}</a></p><h1 class="page-h1">${h1}</h1>${intro ? `<p class="lede">${intro}</p>` : ''}</div></div>`;
  }

  function donateView(ctx) {
    const { c, org } = ctx;
    const scope = c.campaign.scopeLabel;
    const bank = bankTransfer(ctx, { level: 2, id: 'bank-transfer-donate', compact: true });
    return `${pageTitle('Donate')}
<div class="wrap donate-page">
  ${donationCard(ctx, 'donate-main', { heading: 'Choose your donation', bankLink: '#bank-transfer-donate' })}
  <div class="donate-side">
    <div class="trust-block">
      <h2 class="sub-h">Who receives your donation</h2>
      <p>${ctx.v(org.name, 'COLLECTING_ORGANISATION_NAME')}${org.country ? ', ' + esc(org.country) : ''}. ${org.relationshipToMasjid ? esc(org.relationshipToMasjid) : ctx.ph('RELATIONSHIP_TO_MASJID')}</p>
      <p><a class="text-link" href="${ctx.link('transparency')}">How funds are handled</a> · <a class="text-link" href="${ctx.link('policy')}">Donation policy</a></p>
    </div>
    <div class="trust-block"><h2 class="sub-h">Questions</h2><p class="stack">${contactLines(ctx).join('')}</p></div>
  </div>
</div>
${bank ? `<div class="wrap donate-bank">${bank}</div>` : ''}`;
  }

  function draftNote(ctx) {
    return ctx.P ? `<div class="ph-block" role="note"><p class="ph-block-k"><span class="ph-tag">Draft</span> Needs review by the organisation</p><p>Template written for this site's architecture (hosted payment page, no analytics, no donor accounts). The organisation must confirm the facts, legal bases and retention periods before launch.</p></div>` : '';
  }

  function privacyView(ctx) {
    const { c, org, P } = ctx;
    const pol = c.policies || {};
    const provider = ctx.providerName ? esc(ctx.providerName) : ctx.ph('PAYMENT_PROVIDER');
    const fontNote = ctx.opts.target === 'preview'
      ? '<p>This preview loads fonts from Google Fonts, which receives your IP address. The production build serves fonts from this website instead.</p>'
      : '';
    return `${pageHead(ctx, 'Privacy')}
<div class="wrap narrow prose policy">
  ${draftNote(ctx)}
  <h2>Who is responsible</h2>
  <p>${ctx.v(pol.privacyController || org.name, 'COLLECTING_ORGANISATION_NAME')} is responsible for personal information handled through this website and its donations. Contact: ${contactLines(ctx).join(' · ')}</p>
  <h2>What this website collects</h2>
  <p>The website itself does not ask for your name, address or payment details, does not use advertising or analytics cookies, and has no donor accounts. Our hosting provider keeps standard server logs, such as IP addresses and pages requested, to operate and secure the site.</p>
  ${fontNote}
  <h2>When you donate</h2>
  <p>Payments happen on ${provider}'s page. ${provider} collects the details needed to process your payment and shares with us what we need to record and acknowledge your donation, such as your name, email, amount and date. ${provider}'s own privacy notice also applies.</p>
  <p>A record of a donation to a masjid can reveal information about religious belief. We treat donor information as sensitive: we limit who can see it, never publish donor names without your separate permission, and never sell or share it for marketing.</p>
  <h2>How long we keep it</h2>
  <p>${ctx.v(pol.retention, 'RETENTION_PERIOD', 'e.g. as long as required for accounting and legal obligations; state the actual period')}</p>
  <h2>Your rights</h2>
  <p>You can ask to see, correct or delete your information, or object to how we use it, by contacting us. ${P ? ctx.ph('LEGAL_BASES_AND_AUTHORITY', 'Legal bases and the supervisory authority depend on where the organisation is based; confirm before launch.') : ''}</p>
</div>`;
  }

  function policyView(ctx) {
    const { c, payments } = ctx;
    const pol = c.policies || {};
    const rec = payments.recurring || {};
    return `${pageHead(ctx, 'Donation policy')}
<div class="wrap narrow prose policy">
  ${draftNote(ctx)}
  <h2>Use of funds</h2>
  <p>${c.campaign.allocationNote ? esc(c.campaign.allocationNote) : ctx.ph('FUND_ALLOCATION')}</p>
  <h2>How totals are calculated</h2>
  <p>${esc(c.campaign.totalPolicy)}</p>
  <h2>Fees</h2>
  <p>${ctx.v(pol.fees, 'FEES_EXPLANATION')}</p>
  <h2>Mistakes and refunds</h2>
  <p>${pol.refund ? esc(pol.refund) : (ctx.P ? ctx.ph('REFUND_POLICY') : 'Please contact us as soon as possible and we will look into it.')}</p>
  <h2>Monthly donations</h2>
  <p>${rec.enabled ? `Monthly donations are charged ${esc(rec.firstCharge || 'from the first payment')} and then once a month. ${ctx.v(rec.cancellation, 'RECURRING_POLICY')}` : 'Monthly donations are not offered at the moment.'}</p>
  <h2>Delays and surplus</h2>
  <p>${pol.surplusAndDelays ? esc(pol.surplusAndDelays) : (ctx.P ? ctx.ph('SURPLUS_POLICY') : 'Contact us for details.')}</p>
  <h2>Contact</h2>
  <p class="stack">${contactLines(ctx).join('')}</p>
</div>`;
  }

  function statusView(ctx) {
    const provider = ctx.providerName ? esc(ctx.providerName) : (ctx.P ? ctx.ph('PAYMENT_PROVIDER') : 'the payment provider');
    return `${pageHead(ctx, 'Back from the donation page')}
<div class="wrap narrow prose">
  <p>If you completed a donation, your confirmation comes from ${provider}, usually by email. This page cannot tell whether a payment went through, so please rely on that confirmation.</p>
  <p>If you did not receive one, or something went wrong, please contact us before trying again, so that you are not charged twice: ${contactLines(ctx).join(' · ')}</p>
  <p><a class="btn btn-secondary" href="${ctx.link('home')}">Back to the project</a> <a class="btn btn-secondary" href="${ctx.link('progress')}">See construction progress</a></p>
</div>`;
  }

  const VIEWS = { home: homeView, masjid: masjidView, progress: progressView, about: aboutView, transparency: transparencyView, donate: donateView, privacy: privacyView, policy: policyView, status: statusView };

  function viewTitle(ctx, route) {
    const base = ctx.name || (ctx.P ? '[MASJID_NAME]' : 'Masjid appeal');
    const t = ROUTES[route].title;
    return t ? `${t} · ${base}` : `${base}${ctx.c.site.projectLocation ? ' · ' + ctx.c.site.projectLocation : ''}: construction appeal`;
  }

  /** Render the chrome + one view (dist) or all views (preview). */
  function renderBody(data, opts) {
    const ctx = createContext(data, opts);
    const routes = opts.target === 'preview' ? Object.keys(VIEWS) : [opts.currentRoute];
    const views = routes.map((r) => `<div class="view" data-view="${r}" data-title="${esc(viewTitle(ctx, r))}"${opts.target === 'preview' && r !== 'home' ? ' hidden' : ''}>${VIEWS[r](ctx)}</div>`).join('\n');
    return {
      html: `<a class="skip" href="#main">Skip to content</a>
${banner(ctx)}
${header(ctx)}
<main id="main" tabindex="-1">
${views}
</main>
${footer(ctx)}
${opts.variant === 'sample' ? '<p class="sample-pill" aria-hidden="true">Sample data</p>' : ''}`,
      title: viewTitle(ctx, routes[0]),
      payMode: ctx.pay,
    };
  }

  MW.ROUTES = ROUTES;
  MW.renderBody = renderBody;
  MW.viewTitle = (data, opts, route) => viewTitle(createContext(data, opts), route);
})(globalThis.MW = globalThis.MW || {});
