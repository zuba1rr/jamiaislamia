import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
await import('../src/lib.js');
await import('../src/render.js');
const { launchBlockers, loadData, sampleData } = await import('../scripts/build.mjs');
const MW = globalThis.MW;

test('currency exponent', () => {
  assert.equal(MW.currencyExponent('EUR'), 2);
  assert.equal(MW.currencyExponent('JPY'), 0);
  assert.equal(MW.currencyExponent('KWD'), 3);
  assert.equal(MW.currencyExponent(null), 2);
  assert.equal(MW.currencyExponent('PKR'), 2);
  assert.match(MW.formatMoney(250000, 'PKR', 'en', { compact: true }), /^PKR\s2,500$/);
  assert.deepEqual(MW.parseAmount('1,500.50', 'PKR'), { ok: true, minor: 150050 });
});

test('amount parsing: valid inputs become integer minor units', () => {
  assert.deepEqual(MW.parseAmount('50', 'EUR'), { ok: true, minor: 5000 });
  assert.deepEqual(MW.parseAmount(' 50.5 ', 'EUR'), { ok: true, minor: 5050 });
  assert.deepEqual(MW.parseAmount('1,000.25', 'GBP'), { ok: true, minor: 100025 });
  assert.deepEqual(MW.parseAmount('500', 'JPY'), { ok: true, minor: 500 });
  assert.deepEqual(MW.parseAmount('0.1', 'EUR', { min: 10 }), { ok: true, minor: 10 });
});

test('amount parsing: blank, zero, negative, malformed, excessive are rejected', () => {
  const lim = { min: 100, max: 10000000 };
  for (const [input, code] of [['', 'blank'], ['  ', 'blank'], ['0', 'zero'], ['0.00', 'zero'], ['-5', 'negative'],
    ['abc', 'malformed'], ['1e5', 'malformed'], ['5.', 'malformed'], ['.5', 'malformed'], ['1.2.3', 'malformed'], ['12,34', 'malformed'],
    ['NaN', 'malformed'], ['Infinity', 'malformed'], ['50.123', 'precision'], ['0.5', 'too_low'], ['100001', 'too_high'],
    ['9999999999999999999', 'too_high']]) {
    const r = MW.parseAmount(input, 'EUR', lim);
    assert.equal(r.ok, false, input);
    assert.equal(r.code, code, input);
  }
  assert.equal(MW.parseAmount('5.5', 'JPY').code, 'precision');
});

test('payment mode: live is refused unless every verification is true', () => {
  const org = { name: 'Org' };
  const base = { provider: 'x', recipientVerified: true, accountApproved: true, liveUrl: 'https://pay.example/live', testUrl: 'https://pay.example/test', currency: 'EUR', allowedHosts: ['pay.example'] };
  assert.equal(MW.resolvePaymentMode({ payments: { ...base, mode: 'live' } }, org).mode, 'live');
  // a payment URL on a host that is not on the approved list never goes live or test
  assert.equal(MW.resolvePaymentMode({ payments: { ...base, mode: 'live', liveUrl: 'https://evil.example/pay', testUrl: 'https://evil.example/t' } }, org).mode, 'preview');
  assert.equal(MW.resolvePaymentMode({ payments: { ...base, mode: 'live', allowedHosts: [] } }, org).mode, 'preview');
  assert.throws(() => MW.buildHandoffUrl('https://evil.example/x', { allowedHosts: ['pay.example'] }, {}));
  assert.equal(MW.isAllowedPaymentUrl('https://pay.example.evil.com/x', ['pay.example']), false);
  for (const k of ['recipientVerified', 'accountApproved']) {
    const r = MW.resolvePaymentMode({ payments: { ...base, mode: 'live', [k]: false } }, org);
    assert.equal(r.mode, 'test', k); assert.ok(r.reasons.length);
  }
  assert.equal(MW.resolvePaymentMode({ payments: { ...base, mode: 'live', liveUrl: 'http://insecure' } }, org).mode, 'test');
  assert.equal(MW.resolvePaymentMode({ payments: { ...base, mode: 'live' } }, {}).mode, 'test');
  assert.equal(MW.resolvePaymentMode({ payments: { mode: 'live' } }, org).mode, 'preview');
  assert.equal(MW.resolvePaymentMode({ payments: { mode: 'test', provider: 'x' } }, org).mode, 'preview');
  assert.equal(MW.resolvePaymentMode({ payments: {} }, org).mode, 'preview');
});

test('handoff URL only carries amount when the provider supports it', () => {
  const sel = { minor: 5000, frequency: 'monthly' };
  assert.equal(MW.buildHandoffUrl('https://p.example/c', { currency: 'EUR', amountHandoff: { supported: false } }, sel), 'https://p.example/c');
  assert.equal(MW.buildHandoffUrl('https://p.example/c', { currency: 'EUR', amountHandoff: { supported: true, param: 'amount', unit: 'major' } }, sel), 'https://p.example/c?amount=50.00');
  assert.equal(MW.buildHandoffUrl('https://p.example/c?a=1', { currency: 'EUR', amountHandoff: { supported: true, param: 'amt', unit: 'minor', frequencyParam: 'f' } }, sel), 'https://p.example/c?a=1&amt=5000&f=monthly');
});

test('funding snapshot: hidden without verified figures, never a misleading zero', () => {
  assert.equal(MW.fundingSnapshot({ currentPhaseTarget: null, confirmedRaised: 0, financialAsOf: '2026-01-01' }), null);
  assert.equal(MW.fundingSnapshot({ currentPhaseTarget: 1000, confirmedRaised: 10, financialAsOf: null }), null);
  assert.deepEqual(MW.fundingSnapshot({ currentPhaseTarget: 12000000, confirmedRaised: 4710000, financialAsOf: '2026-11-02' }),
    { target: 12000000, raised: 4710000, remaining: 7290000, pct: 39.2, overTarget: false });
  const over = MW.fundingSnapshot({ currentPhaseTarget: 100, confirmedRaised: 150, financialAsOf: '2026-11-02' });
  assert.equal(over.remaining, 0); assert.equal(over.pct, 100); assert.equal(over.overTarget, true);
});

test('money formatting never invents a currency', () => {
  assert.match(MW.formatMoney(5000, null, 'en'), /\[CURRENCY\]/);
  assert.equal(MW.formatMoney(5000, 'EUR', 'en', { compact: true }), '€50');
  assert.equal(MW.formatDate('2026-03', 'en'), 'March 2026');
  assert.equal(MW.formatDate('2026-11-02', 'en'), 'November 2, 2026');
});

test('rendering escapes content', () => {
  const data = loadData();
  data.content.site.masjidName = '<img src=x onerror=alert(1)>';
  const html = MW.renderBody(data, { target: 'dist', preview: false, currentRoute: 'home' }).html;
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img src=x'));
});

test('launch build: current content is blocked; sample data is also blocked', () => {
  const data = loadData();
  assert.ok(launchBlockers(data).length > 0);
  const s = sampleData(data);
  const b = launchBlockers(s);
  assert.ok(b.some((x) => /Placeholder media|Sample/.test(x)));
  assert.ok(b.some((x) => /Payments resolve/.test(x)));
});

test('live render without data omits placeholders and the fake bar', () => {
  const data = loadData();
  const html = ['home', 'masjid', 'progress', 'about', 'transparency', 'donate'].map((r) => MW.renderBody(data, { target: 'dist', preview: false, currentRoute: r }).html).join('');
  assert.ok(!/class="ph[" -]/.test(html));
  assert.ok(!html.includes('<li></li>'));
  assert.ok(!/alt=""[^ >]/.test(html));
  assert.ok(!html.includes('class="bar"'));
  assert.ok(html.includes('Not yet published'));
});

test('built pages contain no secrets or donor fields', async () => {
  // Build fresh copies first, so the test also works on a clean checkout (e.g. on GitHub).
  const { execFileSync } = await import('node:child_process');
  const build = new URL('../scripts/build.mjs', import.meta.url).pathname;
  execFileSync(process.execPath, [build], { stdio: 'ignore' });
  execFileSync(process.execPath, [build, '--preview-file'], { stdio: 'ignore' });
  const html = readFileSync(new URL('../preview/index.html', import.meta.url), 'utf8')
    + readFileSync(new URL('../dist/donate/index.html', import.meta.url), 'utf8');
  assert.ok(!/sk_(live|test)_|whsec_|api[_-]?key/i.test(html));
  assert.ok(!/name="(card|cvc|cvv|iban|address|phone)"/i.test(html));
});

test('launch: verified bank details still need organisation ownership or an explanation', () => {
  const data = loadData();
  data.finance.bankTransfer.verified = true;
  const b = launchBlockers(data).join('\n');
  assert.match(b, /Bank AL Habib Limited[^:]*: not confirmed as the organisation's own account/);
  assert.match(b, /United Bank Limited \(UBL\): not confirmed as the organisation's own account/);
  assert.match(b, /Easypaisa/);
});

test('unverified bank details never reach a launch render', () => {
  const html = MW.renderBody(loadData(), { target: 'dist', preview: false, currentRoute: 'donate' }).html;
  assert.ok(!html.includes('PK64BAHL'));
  assert.ok(!html.includes('03002903600'));
});

test('cost breakdown total matches the published phase estimate', () => {
  const c = loadData().content.campaign;
  const sum = c.costBreakdown.reduce((t, r) => t + r.cost, 0);
  assert.equal(sum, c.currentPhaseTarget);
  assert.equal(MW.formatMoney(sum, 'PKR', 'en-IN', { compact: true }).replace(/\s/g, ' '), 'PKR 46,57,000');
});

test('euro display conversion is approximate and rounded', () => {
  assert.equal(MW.convertApprox(465700000, 'PKR', 'EUR', 310.71), 1499000); // PKR 4,657,000 -> €14,990
  assert.equal(MW.convertApprox(10000000, 'PKR', 'EUR', 310.71), 32000);    // PKR 100,000 -> €320
  assert.equal(MW.convertApprox(100, 'PKR', 'EUR', 0), null);
});

test('preview shows the bank-transfer section with copyable IBANs; live hides it until verified', () => {
  const data = loadData();
  const pv = MW.renderBody(data, { target: 'preview', preview: true }).html;
  assert.ok(pv.includes('id="bank-transfer-donate"'));
  assert.ok(pv.includes('data-copy-value="PK64BAHL1121008100166701"'));
  assert.ok(pv.includes('PK64 BAHL 1121 0081 0016 6701'));
  const live = ['home', 'donate'].map((r) => MW.renderBody(data, { target: 'dist', preview: false, currentRoute: r }).html).join('');
  assert.ok(!live.includes('id="bank-transfer-donate"'));
  assert.ok(!live.includes('Prefer a bank transfer'));
});

test('material gifts use friendly amounts: at least €5, nearest €5 under €50, nearest €10 above', () => {
  assert.equal(MW.materialGiftAmount(1, 153000, 'PKR', 'EUR', 310.71), 500);     // 1 bag cement €4.92 -> €5
  assert.equal(MW.materialGiftAmount(5, 153000, 'PKR', 'EUR', 310.71), 2500);    // 5 bags €24.62 -> €25
  assert.equal(MW.materialGiftAmount(50, 9000, 'PKR', 'EUR', 310.71), 1500);     // 50 blocks €14.48 -> €15
  assert.equal(MW.materialGiftAmount(0.5, 6500000, 'PKR', 'EUR', 310.71), 10000); // ½ dumper sand mix €104.60 -> €100
  assert.equal(MW.materialGiftAmount(0.25, 12000000, 'PKR', 'EUR', 310.71), 10000); // ¼ dumper aggregate €96.55 -> €100
  assert.equal(MW.materialGiftAmount(0.5, 1800000, 'PKR', 'EUR', 310.71), 3000);  // ½ truck stone €28.97 -> €30
  assert.equal(MW.materialGiftAmount(0, 153000, 'PKR', 'EUR', 310.71), null);
  assert.equal(MW.giftPhrase({ unit: 'dumper', unitPlural: 'dumpers', phrase: '{qty} {unit} of sand mix' }, 0.5), '½ dumper of sand mix');
  assert.equal(MW.giftPhrase({ unit: 'truck', unitPlural: 'trucks', phrase: '{qty} {unit} of crushed stone' }, 1.5), '1½ trucks of crushed stone');
  assert.equal(MW.giftPhrase({ unit: 'bag', unitPlural: 'bags', phrase: '{qty} {unit} of cement' }, 5), '5 bags of cement');
  assert.equal(MW.convertApprox(10000000, 'PKR', 'EUR', 310.71), 32000);        // PKR 100,000 -> €320
});

test('material gift titles describe what an amount covers in plain words', () => {
  const rate = 310.71;
  const q = (euros, unitMinor) => (euros * rate * 100) / unitMinor;
  const sand = { unit: 'dumper', unitPlural: 'dumpers', phrase: '{q} of sand mix', countable: false };
  const cement = { unit: 'bag', unitPlural: 'bags', phrase: '{q} of cement', countable: true };
  const blocks = { unit: 'block', unitPlural: 'blocks', phrase: '{q}', countable: true };
  const stone = { unit: 'truck', unitPlural: 'trucks', phrase: '{q} of crushed stone', countable: false };
  const agg = { unit: 'dumper', unitPlural: 'dumpers', phrase: '{q} of crush aggregate', countable: false };
  assert.equal(MW.describeQty(q(100, 6500000), sand), 'half a dumper of sand mix');
  assert.equal(MW.describeQty(q(20, 6500000), sand), 'a tenth of a dumper of sand mix');
  assert.equal(MW.describeQty(q(220, 6500000), sand), '1 dumper of sand mix');
  assert.equal(MW.describeQty(q(5, 153000), cement), '1 bag of cement');
  assert.equal(MW.describeQty(q(25, 153000), cement), '5 bags of cement');
  assert.equal(MW.describeQty(q(5, 9000), blocks), '17 blocks');
  assert.equal(MW.describeQty(q(30, 1800000), stone), 'half a truck of crushed stone');
  assert.equal(MW.describeQty(q(100, 12000000), agg), 'a quarter of a dumper of crush aggregate');
  assert.equal(MW.describeQty(q(10, 12000000), agg), '1/40 of a dumper of crush aggregate');
});

test('donation box offers Amount, Masjid (5 materials) and Students (5 options); no materials FAQ', () => {
  const html = MW.renderBody(loadData(), { target: 'preview', preview: true }).html;
  for (const id of ['give-gm-amount', 'give-gm-masjid', 'give-gm-students']) assert.ok(html.includes('id="' + id + '"'), id);
  const count = (key) => (html.match(new RegExp('id="give-' + key + '\\d"', 'g')) || []).length;
  assert.equal(count('masjid'), 5);
  assert.equal(count('students'), 5);
  assert.ok(!html.includes('Can I give towards a particular material?'));
});

test('student options describe what an amount covers', () => {
  const d = 10000000 / 365;
  const t3 = { periodDays: 91.25, periodLabel: '3 months', possessive: "3 months'" };
  const day = { periodDays: 1, periodLabel: 'a day', possessive: "a day's" };
  const year = { periodDays: 365, periodLabel: 'a year', possessive: "a year's" };
  assert.equal(MW.describeStudentGift(40, t3, 310.71, d), "half of a student's food and board for 3 months");
  assert.equal(MW.describeStudentGift(5, day, 310.71, d), "a day's food and board for 6 students");
  assert.equal(MW.describeStudentGift(320, year, 310.71, d), "a year's food and board for one student");
});

test('site is split into pages and the home page stays short', () => {
  const data = loadData();
  const home = MW.renderBody(data, { target: 'dist', preview: true, currentRoute: 'home' }).html;
  assert.ok(home.includes('id="give"'));
  for (const id of ['id="funding"', 'id="progress"', 'id="about"', 'id="faq"', 'id="ways"']) assert.ok(!home.includes(id), id);
  for (const r of ['masjid', 'progress', 'about', 'transparency']) assert.ok(MW.ROUTES[r]);
  const tr = MW.renderBody(data, { target: 'dist', preview: true, currentRoute: 'transparency' }).html;
  assert.ok(tr.includes('id="faq"') && tr.includes('aria-current="page"'));
});

test('security: hostile content and URLs never render as markup', async () => {
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync(process.execPath, [new URL('../scripts/security-fuzz.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.match(out, /PASS/);
});

test('finance lock: changing an IBAN without approval is detected', async () => {
  const { fingerprint, checkLock } = await import('../scripts/finance-lock.mjs');
  const data = loadData();
  assert.equal(checkLock(data).ok, true, 'committed details match the approved lock');
  const tampered = JSON.parse(JSON.stringify(data));
  tampered.finance.bankTransfer.accounts[0].iban = 'PK00EVIL0000000000000001';
  assert.notEqual(fingerprint(tampered), fingerprint(data));
  assert.equal(checkLock(tampered).ok, false);
  const host = JSON.parse(JSON.stringify(data));
  host.finance.payments.allowedHosts = ['evil.example'];
  assert.equal(checkLock(host).ok, false);
  const comment = JSON.parse(JSON.stringify(data));
  comment.finance.bankTransfer._readme = 'edited note';
  assert.equal(checkLock(comment).ok, true, 'notes do not count');
});
