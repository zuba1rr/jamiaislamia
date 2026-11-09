#!/usr/bin/env node
/**
 * Finance integrity lock.
 *
 * The fields that decide where donors' money goes (bank accounts, IBANs, SWIFT codes,
 * wallet numbers, payment-provider pages and the approved host list) are fingerprinted
 * with SHA-256 and the fingerprint is stored in config/finance.lock.json.
 *
 * Every build checks the fingerprint. If anyone changes an account number or payment link
 * without re-approving, the build stops and nothing is published.
 *
 *   node scripts/finance-lock.mjs            -> check (exit 1 on mismatch)
 *   node scripts/finance-lock.mjs --approve  -> record the current details as approved
 *
 * Approving is a deliberate, reviewed act: the lock file sits under /config/, which needs
 * the finance owner's review (see .github/CODEOWNERS). Before approving a change, confirm
 * the new details by phone with the Muhtamim on a number you already know, never from the
 * message that asked for the change.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCK = join(ROOT, 'config/finance.lock.json');

const norm = (v) => (v == null ? null : String(v).replace(/\s+/g, ' ').trim());

// Everything in config/finance.json counts (bank accounts, wallets, payment mode, provider
// links, approved hosts, amounts), except "_comment" keys. Fund payment links in content count too.
function strip(v) {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v).filter((k) => !k.startsWith('_')).sort().map((k) => [k, strip(v[k])]));
  }
  return typeof v === 'string' ? norm(v) : v;
}

export function criticalFields(data) {
  return {
    finance: strip(data.finance || {}),
    funds: ((data.content || {}).funds || []).map((x) => ({ id: norm(x.id), testUrl: norm(x.testUrl), liveUrl: norm(x.liveUrl) })),
  };
}

export function fingerprint(data) {
  return createHash('sha256').update(JSON.stringify(criticalFields(data))).digest('hex');
}

const mask = (s) => (s ? s.replace(/\s/g, '').replace(/^(.{4}).*(.{4})$/, '$1…$2') : null);

export function checkLock(data) {
  if (!existsSync(LOCK)) return { ok: false, reason: 'config/finance.lock.json is missing. Run: node scripts/finance-lock.mjs --approve' };
  const lock = JSON.parse(readFileSync(LOCK, 'utf8'));
  const now = fingerprint(data);
  if (lock.sha256 !== now) {
    return { ok: false, reason: 'Bank or payment details have changed since they were last approved (finance.lock.json fingerprint does not match). If the change is genuine, confirm it by phone with the Jamia, then run: node scripts/finance-lock.mjs --approve' };
  }
  return { ok: true };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const data = {
    content: JSON.parse(readFileSync(join(ROOT, 'content/site.json'), 'utf8')),
    finance: JSON.parse(readFileSync(join(ROOT, 'config/finance.json'), 'utf8')),
  };
  if (process.argv.includes('--approve')) {
    const c = criticalFields(data);
    const lock = {
      _readme: 'Fingerprint of the bank and payment details last approved by the finance owner. Builds stop if config/finance.json no longer matches. Change only through a reviewed pull request.',
      sha256: fingerprint(data),
      approvedAt: new Date().toISOString(),
      summary: {
        accounts: ((c.finance.bankTransfer || {}).accounts || []).map((x) => `${x.bank || '?'}: ${mask(x.iban || x.accountNumber)}`),
        wallets: ((c.finance.bankTransfer || {}).mobileWallets || []).map((w) => `${w.provider || '?'}: ${mask(w.number)}`),
        paymentMode: (c.finance.payments || {}).mode || null,
        paymentHosts: (c.finance.payments || {}).allowedHosts || [],
      },

    };
    writeFileSync(LOCK, JSON.stringify(lock, null, 2) + '\n');
    console.log('Approved. Fingerprint ' + lock.sha256.slice(0, 16) + '… recorded in config/finance.lock.json');
  } else {
    const r = checkLock(data);
    console.log(r.ok ? 'Finance lock OK: bank and payment details match the approved fingerprint.' : 'FINANCE LOCK FAILED: ' + r.reason);
    process.exit(r.ok ? 0 : 1);
  }
}
