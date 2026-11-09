/*
 * Pure helpers shared by the build (Node) and the browser.
 * Written as a plain script that attaches to globalThis.MW so the same file
 * can be imported in Node and inlined in the page without a bundler.
 */
(function (MW) {
  'use strict';

  // ISO 4217 minor units where the browser's display rules (CLDR) differ, e.g. Intl shows PKR
  // without decimals but ISO 4217 (and most payment APIs) count PKR in paisa (2 digits).
  // Always confirm the exponent your provider expects before going live.
  const ISO_EXPONENT = { PKR: 2, IDR: 2, HUF: 2, COP: 2, AFN: 2, IRR: 2, LBP: 2, IQD: 3, RSD: 2 };

  /** Number of minor-unit digits for a currency (JPY 0, EUR 2, PKR 2, KWD 3). Unknown/empty -> 2. */
  function currencyExponent(currency) {
    if (!currency) return 2;
    if (Object.prototype.hasOwnProperty.call(ISO_EXPONENT, currency)) return ISO_EXPONENT[currency];
    try {
      return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
    } catch (e) {
      return 2;
    }
  }

  /**
   * Format integer minor units as money. If the currency is unknown, returns the
   * number followed by a bracketed placeholder so it can never pass for a real figure.
   */
  function formatMoney(minor, currency, lang, opts) {
    opts = opts || {};
    const exp = currencyExponent(currency);
    const major = minor / Math.pow(10, exp);
    const whole = Number.isInteger(major);
    const digits = opts.compact && whole ? 0 : exp;
    if (!currency) {
      const n = new Intl.NumberFormat(lang || 'en', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(major);
      return n + ' [CURRENCY]';
    }
    try {
      return new Intl.NumberFormat(lang || 'en', {
        style: 'currency', currency, currencyDisplay: opts.display || 'symbol',
        minimumFractionDigits: digits, maximumFractionDigits: digits,
      }).format(major);
    } catch (e) {
      return major.toFixed(digits) + ' ' + currency;
    }
  }

  /**
   * Parse a donor-typed amount into integer minor units.
   * Accepts "50", "50.5", "1,000.00". Rejects blanks, zero, negatives, exponent
   * notation, too many decimals, and anything outside [min, max].
   */
  function parseAmount(input, currency, limits) {
    limits = limits || {};
    const exp = currencyExponent(currency);
    const raw = String(input == null ? '' : input).trim().replace(/\s+/g, '');
    if (raw === '') return { ok: false, code: 'blank' };
    if (/^-/.test(raw)) return { ok: false, code: 'negative' };
    const re = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?$/;
    const m = raw.match(re);
    if (!m) return { ok: false, code: 'malformed' };
    const decimals = m[1] || '';
    if (decimals.length > exp) return { ok: false, code: 'precision', exp };
    const [intPart] = raw.replace(/,/g, '').split('.');
    if (intPart.length > 12) return { ok: false, code: 'too_high' };
    const minor = parseInt(intPart, 10) * Math.pow(10, exp) + (decimals ? parseInt(decimals.padEnd(exp, '0'), 10) : 0);
    if (!Number.isSafeInteger(minor)) return { ok: false, code: 'too_high' };
    if (minor === 0) return { ok: false, code: 'zero' };
    if (limits.min != null && minor < limits.min) return { ok: false, code: 'too_low', minor };
    if (limits.max != null && minor > limits.max) return { ok: false, code: 'too_high', minor };
    return { ok: true, minor };
  }

  /**
   * Decide which payment mode may actually run. "live" is only honoured when every
   * recipient/account check is explicitly true; otherwise it falls back and says why.
   */
  function resolvePaymentMode(finance, org) {
    const p = (finance && finance.payments) || {};
    const requested = p.mode || 'preview';
    const reasons = [];
    if (requested === 'live') {
      if (!org || !org.name) reasons.push('Collecting organisation name is missing.');
      if (!p.provider) reasons.push('No payment provider is selected.');
      if (p.recipientVerified !== true) reasons.push('Receiving organisation is not marked verified.');
      if (p.accountApproved !== true) reasons.push('Provider has not approved the account for this fundraising activity.');
      if (!isHttpsUrl(p.liveUrl)) reasons.push('No live hosted donation URL.');
      else if (!isAllowedPaymentUrl(p.liveUrl, p.allowedHosts)) reasons.push('Live donation URL is not on the approved payment-host list.');
      if (!p.currency) reasons.push('Donation currency is missing.');
      if (reasons.length === 0) return { mode: 'live', requested, reasons };
    }
    if (requested === 'live' || requested === 'test') {
      if (p.provider && isHttpsUrl(p.testUrl) && isAllowedPaymentUrl(p.testUrl, p.allowedHosts)) return { mode: 'test', requested, reasons };
      if (requested === 'test') reasons.push('Test mode needs a provider and a sandbox/test hosted URL.');
    }
    return { mode: 'preview', requested, reasons };
  }

  /**
   * Allow only https links, mailto/tel, and same-site relative paths.
   * Anything else (javascript:, data:, vbscript:, protocol-relative //host, http:) returns ''.
   */
  function safeUrl(u) {
    if (!u || typeof u !== 'string') return '';
    const t = u.trim();
    if (/[\u0000-\u001f\u007f\s]/.test(t.replace(/ /g, '')) ) return '';
    if (/^(https:\/\/)[^\s]+$/i.test(t)) { try { new URL(t); return t; } catch (e) { return ''; } }
    if (/^(mailto|tel):[^\s<>"']+$/i.test(t)) return t;
    if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return '';
    if (t.startsWith('//') || t.startsWith('\\') || t.includes('\\')) return '';
    if (/^[a-z0-9_.\/#?=&%-]+$/i.test(t)) return t;
    return '';
  }

  function isHttpsUrl(u) {
    if (!u || typeof u !== 'string') return false;
    try { return new URL(u).protocol === 'https:'; } catch (e) { return false; }
  }

  /**
   * Build the hosted-checkout URL. Only adds amount/frequency parameters when the
   * provider is configured to accept them; otherwise the provider collects the amount.
   */
  function isAllowedPaymentUrl(u, allowedHosts) {
    if (!isHttpsUrl(u)) return false;
    const hosts = (allowedHosts || []).map((h) => String(h).toLowerCase());
    if (!hosts.length) return false; // no allowlist: never redirect donors anywhere
    const host = new URL(u).hostname.toLowerCase();
    return hosts.some((h) => host === h || host.endsWith('.' + h));
  }

  function buildHandoffUrl(base, payments, selection) {
    const url = new URL(base);
    if (url.protocol !== 'https:') throw new Error('Payment page must use https.');
    if (payments.allowedHosts && !isAllowedPaymentUrl(base, payments.allowedHosts)) throw new Error('Payment page host is not on the approved list.');
    const h = payments.amountHandoff || {};
    if (h.supported && h.param && selection.minor != null) {
      const val = h.unit === 'major'
        ? (selection.minor / Math.pow(10, currencyExponent(payments.currency))).toFixed(currencyExponent(payments.currency))
        : String(selection.minor);
      url.searchParams.set(h.param, val);
    }
    if (h.frequencyParam && selection.frequency) url.searchParams.set(h.frequencyParam, selection.frequency);
    if (h.descriptionParam && selection.description) url.searchParams.set(h.descriptionParam, selection.description);
    return url.toString();
  }

  /**
   * Funding snapshot maths. Returns null unless target, raised and as-of date are all present,
   * so the page never shows an unverified bar or a misleading zero.
   */
  function fundingSnapshot(campaign) {
    if (!campaign) return null;
    const t = campaign.currentPhaseTarget, r = campaign.confirmedRaised;
    if (!Number.isInteger(t) || !Number.isInteger(r) || t <= 0 || r < 0 || !campaign.financialAsOf) return null;
    const remaining = Math.max(0, t - r);
    const pct = Math.min(100, Math.floor((r / t) * 1000) / 10);
    return { target: t, raised: r, remaining, pct, overTarget: r > t };
  }

  /** Format ISO "YYYY-MM-DD" or "YYYY-MM" without timezone drift. */
  function formatDate(iso, lang) {
    if (!iso) return '';
    const m = String(iso).match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
    if (!m) return String(iso);
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, m[3] ? +m[3] : 1));
    const o = m[3] ? { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' } : { month: 'long', year: 'numeric', timeZone: 'UTC' };
    return new Intl.DateTimeFormat(lang || 'en', o).format(d);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /**
   * Approximate conversion for display only (never for charging). rate = units of `from` per 1 unit of `to`
   * (e.g. 310.71 PKR per EUR). Rounds to whole units, or to the nearest 10 from 1,000 upwards.
   */
  function convertApprox(minor, from, to, rate) {
    if (!Number.isInteger(minor) || !(rate > 0)) return null;
    const major = minor / Math.pow(10, currencyExponent(from)) / rate;
    return roundFriendly(major) * Math.pow(10, currencyExponent(to));
  }

  /** Round for display: nearest 5 below 50, nearest 10 from 50 upwards. */
  function roundFriendly(major) {
    if (!(major > 0)) return 0;
    const step = major < 50 ? 5 : 10;
    return Math.round(major / step) * step;
  }

  /** 0.5 -> "½", 1.5 -> "1½", 0.25 -> "¼", 3 -> "3". */
  function formatQty(q) {
    const whole = Math.floor(q + 1e-9);
    const frac = Math.round((q - whole) * 100) / 100;
    const glyph = { 0.25: '¼', 0.5: '½', 0.75: '¾' }[frac] || (frac ? String(frac).slice(1) : '');
    return (whole ? whole.toLocaleString('en') : (glyph ? '' : '0')) + glyph;
  }

  /**
   * Amount to ask for a material gift: quantity x unit cost (source currency minor units),
   * converted at `rate` (source units per 1 target unit) and ROUNDED UP to a whole target unit,
   * so the gift always covers at least the stated quantity at the published cost.
   */
  function materialGiftAmount(qty, unitMinor, from, to, rate) {
    if (!(qty > 0) || !Number.isFinite(unitMinor) || !(rate > 0)) return null;
    const major = (qty * unitMinor) / Math.pow(10, currencyExponent(from)) / rate;
    return Math.max(5, roundFriendly(major)) * Math.pow(10, currencyExponent(to));
  }

  function giftPhrase(g, qty) {
    return String(g.phrase || '{qty} {unit}').replace('{qty}', formatQty(qty)).replace('{unit}', qty > 1 ? g.unitPlural : g.unit);
  }

  const FRACTIONS = [
    [1 / 10, 'a tenth of a'], [1 / 8, 'an eighth of a'], [1 / 6, 'a sixth of a'], [1 / 5, 'a fifth of a'],
    [1 / 4, 'a quarter of a'], [1 / 3, 'a third of a'], [2 / 5, 'two-fifths of a'], [1 / 2, 'half a'],
    [3 / 5, 'three-fifths of a'], [2 / 3, 'two-thirds of a'], [3 / 4, 'three-quarters of a'], [4 / 5, 'four-fifths of a'],
  ];

  /**
   * Words for a quantity: countable units round to whole numbers ("5 bags", "69 blocks");
   * loads use fractions below one ("half a dumper", "a sixth of a truck", "1/40 of a dumper")
   * and halves above one ("1½ dumpers").
   */
  function describeQty(qty, g) {
    if (!(qty > 0)) return '';
    let q;
    if (g.countable) {
      const n = Math.max(1, Math.round(qty));
      q = n.toLocaleString('en') + ' ' + (n === 1 ? g.unit : g.unitPlural);
    } else if (qty >= 0.9) {
      const h = Math.max(1, Math.round(qty * 2) / 2);
      q = formatQty(h) + ' ' + (h > 1 ? g.unitPlural : g.unit);
    } else if (qty >= 0.09) {
      let best = FRACTIONS[0];
      for (const f of FRACTIONS) if (Math.abs(f[0] - qty) < Math.abs(best[0] - qty)) best = f;
      q = best[1] + ' ' + g.unit;
    } else {
      let n = Math.round(1 / qty);
      if (n > 10) n = Math.round(n / 5) * 5;
      q = '1/' + n + ' of a ' + g.unit;
    }
    return String(g.phrase || '{q}').replace('{q}', q);
  }

  const SHARES = [
    [1 / 10, 'a tenth of'], [1 / 8, 'an eighth of'], [1 / 6, 'a sixth of'], [1 / 5, 'a fifth of'], [1 / 4, 'a quarter of'],
    [1 / 3, 'a third of'], [2 / 5, 'two-fifths of'], [1 / 2, 'half of'], [3 / 5, 'three-fifths of'], [2 / 3, 'two-thirds of'],
    [3 / 4, 'three-quarters of'], [4 / 5, 'four-fifths of'],
  ];

  /**
   * What a euro amount covers for a student-support option with a fixed period:
   * "a day's food and board for 6 students", "half of a student's food and board for 3 months".
   */
  function describeStudentGift(euros, tile, rate, dayPkrMinor) {
    if (!(euros > 0) || !(rate > 0) || !(dayPkrMinor > 0)) return '';
    const periodEuro = (tile.periodDays * dayPkrMinor) / 100 / rate;
    const q = euros / periodEuro;
    if (q < 0.9) {
      if (q < 0.09) return 'part of a student\'s food and board for ' + tile.periodLabel;
      let best = SHARES[0];
      for (const s of SHARES) if (Math.abs(s[0] - q) < Math.abs(best[0] - q)) best = s;
      return best[1] + ' a student\'s food and board for ' + tile.periodLabel;
    }
    const n = Math.max(1, Math.round(q));
    return tile.possessive + ' food and board for ' + (n === 1 ? 'one student' : n.toLocaleString('en') + ' students');
  }

  MW.describeStudentGift = describeStudentGift;
  MW.describeQty = describeQty;
  MW.materialGiftAmount = materialGiftAmount;
  MW.roundFriendly = roundFriendly;
  MW.formatQty = formatQty;
  MW.giftPhrase = giftPhrase;
  MW.convertApprox = convertApprox;
  MW.currencyExponent = currencyExponent;
  MW.formatMoney = formatMoney;
  MW.parseAmount = parseAmount;
  MW.resolvePaymentMode = resolvePaymentMode;
  MW.buildHandoffUrl = buildHandoffUrl;
  MW.fundingSnapshot = fundingSnapshot;
  MW.formatDate = formatDate;
  MW.isHttpsUrl = isHttpsUrl;
  MW.safeUrl = safeUrl;
  MW.isAllowedPaymentUrl = isAllowedPaymentUrl;
  MW.esc = esc;
})(globalThis.MW = globalThis.MW || {});
