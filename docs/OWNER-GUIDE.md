# Owner guide

Short instructions for the volunteers who keep the site accurate. Ask the technical owner for help with anything not covered here.

## Who owns what

| Area | Owner (fill in) | Notes |
|---|---|---|
| Content: photos, updates, stage | | Edits `content/site.json` |
| Funding figures | | Reconciles before publishing |
| Payment provider account | | Only person who edits `config/finance.json` |
| Domain, hosting, GitHub | | MFA on every account |
| Software updates and backups | | Monthly check |

## Publish a construction update

1. Take photos of the actual site. Remove location data (most phones: share → options → remove location; or `exiftool -all= file.jpg`).
2. Resize to about 2000 px wide and save in `media/` with a dated name, e.g. `2026-11-08-roof-trusses.jpg`.
3. In `content/site.json → updates`, add an entry: `title`, `date` (YYYY-MM-DD, the real date), `body` (what was done), `next` (next step), `photo` (`src`, `alt` describing what is visible, `width`, `height`).
4. Update `status.currentStage` and `status.lastProjectUpdate`. Move milestones between `planned`, `in_progress` and `completed`. Use `"dateType": "estimate"` for anything not yet done.
5. Never reuse an old photo with a new date, and never use a photo of another building or an AI image as this project. Architect drawings use `"type": "design"`.

The homepage shows the three most recent updates automatically.

## Update the funding figures

1. Export successful donations for this appeal from the provider dashboard. Subtract refunds and reversals. Add bank transfers **only** after they appear on the bank statement, and check none were already counted.
2. Use one reporting currency. Do not add different currencies together.
3. Set `campaign.confirmedRaised` (minor units: 47,100.00 → `4710000`), `campaign.financialAsOf` (the date you reconciled) and `campaign.figureSource`.
4. Pledges and future monthly payments are not money received. Leave them out.

If you can't reconcile, leave the figures as they are. The page shows their date. If they are wrong, set them to `null` and the bar disappears.

## Payments

- Review payments, refunds and disputes in the provider dashboard. The website has no donor data.
- **Refunds/mistakes:** follow the donation policy; process refunds in the provider dashboard; reply to the donor from the organisation email.
- **Monthly donations** (if enabled): cancellations are handled in the provider's donor portal or dashboard.
- **Changing the recipient, payout account or hosted link** is a finance-owner action. Confirm any change by phone with a second trustee before merging. Watch for emails asking you to "update bank details": they are a common fraud.
- If the provider link breaks, set `payments.mode` to `preview` so the site stops sending donors to a broken page, and post the contact address.

## Monthly maintenance

- `npm outdated` and update dependencies; run `npm test` and `npm run build`.
- Check the live site on a phone: donate button opens the provider page, figures and dates are current.
- Confirm MFA and remove access for anyone who has left.
- Backups: the Git repository is the backup of the site. Keep a second copy of `media/` originals (e.g. in the organisation's cloud drive). Restore = clone the repo and redeploy.

## Recurring costs (categories, get real quotes)

Domain name · static hosting (often free tiers exist; check current terms) · payment provider fees per transaction · organisation email · optional CMS · volunteer/developer time. Do not rely on any free plan or fee rate without checking the provider's current pricing page.
