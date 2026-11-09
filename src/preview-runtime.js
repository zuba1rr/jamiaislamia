/*
 * Preview-artifact only: hash routing between views in one document, and the
 * Placeholders / Sample data switch. Not shipped in the production build.
 */
(function (MW) {
  'use strict';
  const DATA = MW.PREVIEW_DATA; // { placeholder: {content, finance}, sample: {content, finance} }
  const app = document.getElementById('app');
  const VIEW_BY_HASH = {};
  Object.keys(MW.ROUTES).forEach((k) => { VIEW_BY_HASH[MW.ROUTES[k].hash] = k; });
  let variant = 'placeholder';
  try { variant = sessionStorage.getItem('mw-variant') === 'sample' ? 'sample' : 'placeholder'; } catch (e) { /* storage unavailable */ }

  function mount(v, keepScroll) {
    variant = v;
    const y = window.scrollY;
    app.innerHTML = MW.renderBody(DATA[v], { target: 'preview', preview: true, variant: v }).html;
    MW.initClient(app);
    app.querySelectorAll('[data-variant]').forEach((b) => b.addEventListener('click', () => {
      try { sessionStorage.setItem('mw-variant', b.dataset.variant); } catch (e) { /* ignore */ }
      mount(b.dataset.variant, true);
      const again = app.querySelector(`[data-variant="${b.dataset.variant}"]`);
      if (again) again.focus();
    }));
    route(false);
    if (keepScroll) window.scrollTo(0, y);
  }

  function show(view) {
    let shown;
    app.querySelectorAll('[data-view]').forEach((el) => {
      const on = el.dataset.view === view;
      el.hidden = !on;
      if (on) shown = el;
    });
    if (shown) document.title = shown.dataset.title;
    app.querySelectorAll('[data-nav]').forEach((a) => { if (a.dataset.nav === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    return shown;
  }

  function route(fromNav) {
    const h = decodeURIComponent(location.hash.slice(1));
    if (VIEW_BY_HASH[h] && VIEW_BY_HASH[h] !== 'home') {
      show(VIEW_BY_HASH[h]);
      if (fromNav) { window.scrollTo(0, 0); const h1 = app.querySelector(`[data-view="${VIEW_BY_HASH[h]}"] h1`); if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); } }
      return;
    }
    const target = h ? document.getElementById(h) : null;
    const inView = target && target.closest('[data-view]');
    const current = app.querySelector('[data-view]:not([hidden])');
    if (!target || inView) show(inView ? inView.dataset.view : 'home');
    else if (!current) show('home');
    if (fromNav) {
      if (target && h !== 'top') { target.scrollIntoView(); if (target.matches('main, section, [tabindex]')) target.focus({ preventScroll: true }); }
      else window.scrollTo(0, 0);
    }
  }

  window.addEventListener('hashchange', () => route(true));
  if (variant !== 'placeholder') mount(variant);
  else { MW.initClient(app); app.querySelectorAll('[data-variant]').forEach((b) => b.addEventListener('click', () => { try { sessionStorage.setItem('mw-variant', b.dataset.variant); } catch (e) { /* ignore */ } mount(b.dataset.variant, true); const again = app.querySelector(`[data-variant="${b.dataset.variant}"]`); if (again) again.focus(); })); route(true); }
})(globalThis.MW = globalThis.MW || {});
