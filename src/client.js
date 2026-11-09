/*
 * Progressive enhancement: donation panel, mobile menu, share link.
 * Requires lib.js. Pages remain readable without it.
 */
(function (MW) {
  'use strict';

  const ERRORS = {
    blank: 'Enter an amount, or choose one of the amounts above.',
    zero: 'Enter an amount greater than zero.',
    negative: 'Enter an amount greater than zero.',
    malformed: 'Use numbers only, for example 50 or 50.00.',
    precision: 'Too many decimal places for this currency.',
  };

  function initDonation(root) {
    if (root.dataset.ready) return;
    root.dataset.ready = '1';
    let cfg;
    try { cfg = JSON.parse(root.querySelector('[data-donate-config]').textContent); } catch (e) { return; }
    const form = root.querySelector('form');
    const btn = root.querySelector('[data-submit]');
    const err = root.querySelector('.field-error');
    const summary = root.querySelector('[data-summary]');
    const custom = root.querySelector('input[name="custom"]');
    const presets = Array.from(root.querySelectorAll('.preset-grid input[type="radio"]'));
    const freqInputs = Array.from(root.querySelectorAll('input[name$="-freq"]'));
    const monthlyHelp = root.querySelector('[data-monthly-help]');
    const handoff = root.querySelector('[data-handoff]');
    const modeInputs = Array.from(root.querySelectorAll('input[name$="-givemode"]'));
    const toInputs = Array.from(root.querySelectorAll('input[name$="-to"]'));
    const amountPanel = root.querySelector('[data-panel="amount"]');
    const tiles = cfg.tiles || { masjid: [], students: [] };
    const funds = cfg.funds || [];
    const fmt = (m) => MW.formatMoney(m, cfg.currency, cfg.lang, { compact: true });
    const limits = { min: cfg.min, max: cfg.max };

    // One controller per tile panel (masjid materials, student support).
    const panels = {};
    ['masjid', 'students'].forEach((key) => {
      const el = root.querySelector('[data-panel="' + key + '"]');
      if (!el) return;
      panels[key] = {
        el, list: tiles[key] || [],
        radios: Array.from(el.querySelectorAll('.mat-tiles input[type="radio"]')),
        input: el.querySelector('[data-amt-input]'),
        title: el.querySelector('[data-impact-title]'),
        hint: el.querySelector('[data-step-hint]'),
      };
    });

    function frequency() { const f = freqInputs.find((i) => i.checked); return f ? f.value : 'once'; }
    function giveMode() { const m = modeInputs.find((i) => i.checked); return m ? m.value : 'amount'; }
    function fundId() {
      const m = giveMode();
      if (m === 'masjid') return 'masjid-construction';
      if (m === 'students') return 'student-support';
      const t = toInputs.find((i) => i.checked);
      return t ? t.value : (funds[0] ? funds[0].id : null);
    }
    function fund() { return funds.find((f) => f.id === fundId()) || null; }
    function tileOf(pn) { const r = pn.radios.find((i) => i.checked); return r ? pn.list[parseInt(r.value, 10)] : null; }

    function describe(t, euros) {
      if (!cfg.equiv) return '';
      if (t.kind === 'student') return MW.describeStudentGift(euros, t, cfg.equiv.rate, cfg.studentDayPkrMinor);
      return MW.describeQty((euros * cfg.equiv.rate * 100) / t.unitMinor, t);
    }

    function current() {
      if (!cfg.showAmounts) return { ok: true, minor: null };
      const m = giveMode();
      if (panels[m]) {
        const pn = panels[m];
        const t = tileOf(pn);
        if (!t) return { ok: false, msg: 'Choose an option.' };
        const raw = pn.input ? pn.input.value.trim() : '';
        const euros = parseInt(raw, 10);
        if (!/^\d+$/.test(raw) || euros < t.min || euros % t.step !== 0) {
          return { ok: false, msg: 'For ' + t.name.toLowerCase() + ', choose an amount in steps of ' + fmt(t.step * 100) + ', from ' + fmt(t.min * 100) + '.' };
        }
        if (euros > t.max) return { ok: false, msg: 'That is more than the appeal needs for ' + t.name.toLowerCase() + ' (about ' + fmt(t.max * 100) + '). Please choose a smaller amount.' };
        if (euros * 100 > cfg.max) return { ok: false, msg: 'The maximum online donation is ' + fmt(cfg.max) + '. For a larger gift, please contact us.' };
        return { ok: true, minor: euros * 100, covers: describe(t, euros) };
      }
      if (custom && custom.value.trim() !== '') {
        const r = MW.parseAmount(custom.value, cfg.currency, limits);
        if (!r.ok) {
          let msg = ERRORS[r.code];
          if (r.code === 'too_low') msg = 'The minimum online donation is ' + fmt(cfg.min) + '.';
          if (r.code === 'too_high') msg = 'The maximum online donation is ' + fmt(cfg.max) + '. For a larger gift, please contact us' + (cfg.contact ? ' at ' + cfg.contact : '') + '.';
          return { ok: false, msg };
        }
        return r;
      }
      const p = presets.find((i) => i.checked);
      if (p) return { ok: true, minor: parseInt(p.value, 10) };
      return { ok: false, msg: ERRORS.blank };
    }

    function equivText(minor) {
      const q = cfg.equiv;
      if (!q) return '';
      const major = minor / Math.pow(10, MW.currencyExponent(cfg.currency)) * q.rate;
      const rounded = Math.round(major / (major >= 1000 ? 10 : 1)) * (major >= 1000 ? 10 : 1);
      return ' (about ' + MW.formatMoney(rounded * Math.pow(10, MW.currencyExponent(q.code)), q.code, q.locale, { compact: true }) + ')';
    }

    function label(sel) {
      if (!cfg.showAmounts) return 'Continue to secure donation page';
      if (!sel.ok) return 'Donate';
      return 'Donate ' + fmt(sel.minor) + (frequency() === 'monthly' ? ' monthly' : ' once');
    }

    function refresh(showErrors) {
      const m = giveMode();
      if (amountPanel && Object.keys(panels).length) amountPanel.hidden = m !== 'amount';
      Object.keys(panels).forEach((k) => {
        const pn = panels[k];
        pn.el.hidden = k !== m;
        if (k === m) {
          const t = tileOf(pn);
          const euros = pn.input ? parseInt(pn.input.value, 10) : NaN;
          if (t && euros > 0 && pn.title) {
            const text = describe(t, euros);
            if (pn.title.textContent !== text) pn.title.textContent = text;
          }
        }
      });
      const sel = current();
      btn.textContent = label(sel);
      if (summary) {
        const f = fund();
        summary.textContent = sel.ok && sel.minor != null
          ? 'You are giving ' + fmt(sel.minor) + (frequency() === 'monthly' ? ' a month' : ' once') + (f ? ', towards ' + f.name.charAt(0).toLowerCase() + f.name.slice(1) : '') + equivText(sel.minor) + '.'
          : '';
      }
      if (monthlyHelp) monthlyHelp.hidden = frequency() !== 'monthly';
      if (showErrors) setError(sel.ok ? '' : sel.msg);
      else if (sel.ok) setError('');
      return sel;
    }

    function setError(msg) {
      err.textContent = msg || '';
      if (custom) {
        if (msg && custom.value.trim() !== '') custom.setAttribute('aria-invalid', 'true');
        else custom.removeAttribute('aria-invalid');
      }
    }

    presets.forEach((p) => p.addEventListener('change', () => { if (custom) custom.value = ''; refresh(false); }));
    if (custom) {
      custom.addEventListener('input', () => {
        if (custom.value.trim() !== '') presets.forEach((p) => { p.checked = false; });
        refresh(false);
      });
      custom.addEventListener('blur', () => { if (custom.value.trim() !== '') refresh(true); });
    }
    freqInputs.forEach((f) => f.addEventListener('change', () => refresh(false)));
    modeInputs.forEach((i) => i.addEventListener('change', () => { setError(''); refresh(false); }));
    toInputs.forEach((i) => i.addEventListener('change', () => refresh(false)));

    function applyTile(pn, amount) {
      const t = tileOf(pn); if (!t || !pn.input) return;
      pn.input.value = amount != null ? amount : t.amount;
      pn.input.min = t.min; pn.input.step = t.step; pn.input.max = t.max;
      if (pn.hint) pn.hint.textContent = 'In steps of ' + fmt(t.step * 100) + ', from ' + fmt(t.min * 100);
    }
    Object.keys(panels).forEach((k) => {
      const pn = panels[k];
      pn.radios.forEach((r) => r.addEventListener('change', () => { applyTile(pn); setError(''); refresh(false); }));
      if (pn.input) {
        pn.input.addEventListener('input', () => refresh(false));
        pn.input.addEventListener('blur', () => refresh(true));
      }
      pn.el.querySelectorAll('[data-amt-dec],[data-amt-inc]').forEach((b) => b.addEventListener('click', () => {
        const t = tileOf(pn); if (!t) return;
        const now = parseInt(pn.input.value, 10) || t.min;
        const snapped = Math.round(now / t.step) * t.step;
        const next = b.hasAttribute('data-amt-inc') ? Math.min(t.max, snapped + t.step) : Math.max(t.min, snapped - t.step);
        pn.input.value = next; setError(''); refresh(false);
      }));
    });

    // Used by the "Two ways to give" links.
    root.pick = (tab, tileIndex, amount) => {
      const mi = modeInputs.find((i) => i.value === tab); if (mi) mi.checked = true;
      const pn = panels[tab];
      if (pn) { const r = pn.radios[tileIndex]; if (r) r.checked = true; applyTile(pn, amount); }
      setError(''); refresh(false);
    };

    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      if (btn.getAttribute('aria-disabled') === 'true') return; // double-click guard
      const sel = refresh(true);
      if (!sel.ok) {
        const pn = panels[giveMode()];
        (pn && pn.input ? pn.input : (custom && custom.value.trim() !== '' ? custom : (presets[0] || custom))).focus();
        return;
      }
      const destination = (fund() && fund().url) || cfg.url;
      if (cfg.mode === 'preview' || !destination) { showHandoffPreview(sel); return; }
      let target;
      try {
        target = MW.buildHandoffUrl(destination, { currency: cfg.currency, amountHandoff: cfg.handoff, allowedHosts: cfg.allowedHosts }, { minor: sel.minor, frequency: frequency(), description: sel.covers || null });
        if (cfg.fundParam && fund()) { const u = new URL(target); u.searchParams.set(cfg.fundParam, fund().id); target = u.toString(); }
      } catch (e) { setError('The donation page link is not set up correctly. Please contact us.'); return; }
      btn.setAttribute('aria-disabled', 'true');
      btn.textContent = 'Opening secure donation page…';
      window.location.assign(target);
    });

    // Re-enable after back/forward cache restore.
    window.addEventListener('pageshow', () => { btn.removeAttribute('aria-disabled'); refresh(false); });

    function showHandoffPreview(sel) {
      const e = MW.esc;
      const amount = sel.minor != null ? `${e(fmt(sel.minor))} <span class="muted">(${sel.minor} minor units)</span>` : 'chosen on the provider page';
      const reasons = (cfg.reasons || []).length ? `<p class="muted">Live mode is blocked: ${cfg.reasons.map(e).join(' ')}</p>` : '';
      const f = fund();
      handoff.innerHTML = `
        <p class="handoff-h"><strong>Nothing was charged.</strong> Payments are not connected yet.</p>
        <p>On the live site, this button opens ${cfg.provider ? e(cfg.provider) : 'the approved provider'}'s secure page with:</p>
        <dl class="kv kv-tight">
          <div><dt>Supports</dt><dd>${f ? e(f.name) + ` <code>${e(f.id)}</code>` : `<code>${e(cfg.campaignId)}</code>`}</dd></div>
          <div><dt>Amount</dt><dd>${amount}</dd></div>
          <div><dt>Currency</dt><dd>${cfg.currency ? e(cfg.currency) : '<mark class="ph">DONATION_CURRENCY</mark>'}</dd></div>
          <div><dt>Frequency</dt><dd>${frequency() === 'monthly' ? 'Monthly' : 'One time'}</dd></div>
          ${sel.covers ? `<div><dt>Covers about</dt><dd>${e(sel.covers)}</dd></div>` : ''}
        </dl>
        ${reasons}
        <p class="muted">To connect: verify the receiving organisation, get an approved provider account, then add its test page URL to <code>config/finance.json</code>.</p>
        <button type="button" class="btn btn-secondary" data-close>Close</button>`;
      handoff.hidden = false;
      handoff.focus();
      handoff.querySelector('[data-close]').addEventListener('click', () => { handoff.hidden = true; btn.focus(); }, { once: true });
    }

    refresh(false);
  }

  function initMenu(scope) {
    const btn = scope.querySelector('.menu-btn');
    const list = scope.querySelector('#nav-list');
    if (!btn || !list || btn.dataset.ready) return;
    btn.dataset.ready = '1';
    const close = () => { btn.setAttribute('aria-expanded', 'false'); list.classList.remove('open'); };
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      list.classList.toggle('open', open);
      if (open) { const a = list.querySelector('a'); if (a) a.focus(); }
    });
    list.addEventListener('click', (e) => { if (e.target.closest('a')) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') { close(); btn.focus(); } });
  }

  function initShare(scope) {
    scope.querySelectorAll('[data-share]').forEach((box) => {
      if (box.dataset.ready) return;
      box.dataset.ready = '1';
      const input = box.querySelector('[data-share-url]');
      const status = box.querySelector('[data-share-status]');
      if (!input.value) input.value = window.location.href.split('#')[0];
      box.querySelector('[data-copy]').addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(input.value);
          status.textContent = 'Link copied.';
        } catch (e) {
          input.focus(); input.select();
          status.textContent = 'Copy the link above to share it.';
        }
      });
    });
  }

  function initCopy(scope) {
    scope.querySelectorAll('[data-copy-value]').forEach((btn) => {
      if (btn.dataset.ready) return;
      btn.dataset.ready = '1';
      btn.addEventListener('click', async () => {
        const wrap = btn.closest('.wire') || document;
        const status = wrap.querySelector('[data-copy-status]');
        const label = (btn.getAttribute('aria-label') || 'Copy').replace(/^Copy /, '');
        try {
          await navigator.clipboard.writeText(btn.dataset.copyValue);
          btn.textContent = 'Copied';
          if (status) status.textContent = label + ' copied.';
          setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
        } catch (e) {
          const val = btn.parentElement.querySelector('.acct-val');
          if (val) { const r = document.createRange(); r.selectNodeContents(val); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); }
          if (status) status.textContent = 'Press Ctrl+C (or Cmd+C) to copy the selected ' + label + '.';
        }
      });
    });
  }

  function initPickers(scope) {
    scope.querySelectorAll('[data-pick-tab]').forEach((a) => {
      if (a.dataset.ready) return;
      a.dataset.ready = '1';
      a.addEventListener('click', () => {
        const card = Array.from(document.querySelectorAll('[data-donate]')).find((el) => el.offsetParent !== null);
        if (card && card.pick) card.pick(a.dataset.pickTab, parseInt(a.dataset.pickTile, 10), parseInt(a.dataset.pickAmount, 10));
      });
    });
  }

  // Lightbox: links marked data-lightbox open their image in a full-screen dialog with previous/next.
  // Without JavaScript the same links simply open the image.
  let lb = null;
  function lightbox() {
    if (lb) return lb;
    const d = document.createElement('dialog');
    d.className = 'lightbox';
    d.setAttribute('aria-label', 'Image viewer');
    const fig = document.createElement('figure');
    const img = document.createElement('img');
    const cap = document.createElement('figcaption');
    fig.append(img, cap);
    const mk = (cls, label, txt) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.setAttribute('aria-label', label); b.textContent = txt; return b; };
    const close = mk('lb-close', 'Close', '×');
    const prev = mk('lb-prev', 'Previous image', '‹');
    const next = mk('lb-next', 'Next image', '›');
    const count = document.createElement('p'); count.className = 'lb-count';
    d.append(fig, prev, next, close, count);
    document.body.appendChild(d);
    lb = { d, img, cap, prev, next, close, count, items: [], i: 0, opener: null };
    const show = (i) => {
      const n = lb.items.length; lb.i = (i + n) % n;
      const a = lb.items[lb.i];
      img.src = a.getAttribute('href');
      img.alt = a.dataset.alt || '';
      cap.textContent = a.dataset.caption || '';
      count.textContent = n > 1 ? `${lb.i + 1} of ${n}` : '';
      prev.hidden = next.hidden = n < 2;
    };
    lb.show = show;
    prev.addEventListener('click', () => show(lb.i - 1));
    next.addEventListener('click', () => show(lb.i + 1));
    close.addEventListener('click', () => d.close());
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    d.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(lb.i - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); show(lb.i + 1); }
    });
    let x0 = null;
    d.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    d.addEventListener('touchend', (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) show(lb.i + (dx < 0 ? 1 : -1)); x0 = null; });
    d.addEventListener('close', () => { document.documentElement.classList.remove('lb-open'); if (lb.opener) lb.opener.focus(); });
    return lb;
  }
  function initLightbox(scope) {
    scope.querySelectorAll('a[data-lightbox]').forEach((a) => {
      if (a.dataset.lbReady) return; a.dataset.lbReady = '1';
      a.addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || typeof HTMLDialogElement !== 'function') return;
        e.preventDefault();
        const box = lightbox();
        const view = a.closest('[data-view]') || document;
        box.items = Array.from(view.querySelectorAll(`a[data-lightbox="${a.dataset.lightbox}"]`));
        box.opener = a;
        box.show(box.items.indexOf(a));
        document.documentElement.classList.add('lb-open');
        box.d.showModal();
        box.close.focus();
      });
    });
  }

  function init(scope) {
    scope = scope || document;
    initPickers(scope);
    initCopy(scope);
    scope.querySelectorAll('[data-donate]').forEach(initDonation);
    initMenu(scope);
    initShare(scope);
    initLightbox(scope);
  }

  MW.initClient = init;
})(globalThis.MW = globalThis.MW || {});
