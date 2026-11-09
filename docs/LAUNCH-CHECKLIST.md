# Launch checklist

`npm run check:launch` covers the automatic items. These need people:

## Verify (with evidence on file)

- [ ] Legal name and country of the collecting organisation; registration details if any
- [ ] Relationship between that organisation and the masjid; onward-transfer arrangement if they are in different countries
- [ ] Settlement bank account belongs to the organisation (not a person)
- [ ] Provider has approved this organisation **and** this fundraising activity, for the donor countries and currency
- [ ] Hosted page shows the correct recipient name; test payments complete in the sandbox (success, decline, cancel)
- [ ] Refund, monthly (if enabled), surplus/delay and fee wording approved by trustees
- [ ] Tax relief / Gift Aid / ANBI / Zakat statements: leave out unless verified by a qualified person
- [ ] Privacy notice reviewed for the organisation's country (legal bases, retention, authority); donation data treated as potentially revealing religious belief
- [ ] Photos are of the actual site, dated, with permission; designs labelled as visualisations

## Configure

- [ ] `content/site.json` complete; `site.primaryLanguageConfirmed: true`; `site.canonicalUrl` set
- [ ] `config/finance.json`: `provider`, `currency`, `testUrl`, `liveUrl`, `methods` (only those actually enabled), `recipientVerified: true`, `accountApproved: true`, `mode: "live"`
- [ ] CODEOWNERS handles replaced; branch protection requires code-owner review
- [ ] MFA on registrar, host, GitHub, provider, email
- [ ] Security headers active on the host (check with the browser's network panel)

## Final checks on the deployed site

- [ ] `npm run build:launch` succeeds; no banner, no placeholder markers, pages indexable except `/donation-status/`
- [ ] Phone (≈375 px), tablet (768 px), desktop (1440 px); keyboard only; 200% zoom
- [ ] Donate button reaches the live provider page with the right amount/currency/frequency
- [ ] Lighthouse/PageSpeed run recorded with conditions; targets LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 (field data later)
