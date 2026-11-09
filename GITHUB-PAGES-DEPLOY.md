# GitHub Pages publication guide (prepared for this masjid website)

## Before publishing

- GitHub Free needs a **PUBLIC** repository for GitHub Pages. A public repository makes `content/site.json` and `config/finance.json` (including any bank account details) readable to everyone. Review all public-facing and financial information *before* uploading.
- This website currently runs in **PREVIEW** mode. Online payments are **disabled**, the pages carry `noindex`, and the preview contains unverified information. **Warning: the preview renderer can still display bank transfer details even when marked unverified.** People may send money manually if you publish those details. Do not share publicly until the bank transfer information is appropriately verified, or have a developer suppress the account details in the public preview.
- The 13 production launch checks remain in effect. Do **not** change the workflow to `npm run build:launch` until those checks and the manual owner checklist are complete.
- GitHub Pages ignores the generated `_headers` file; this platform does not apply the custom security headers included for Netlify and Cloudflare Pages. Use a hosted payment provider for donations, never your own card form.

## Steps

1. Go to https://github.com/new and create a repository named `YOUR-USERNAME.github.io`, replacing `YOUR-USERNAME` with your exact GitHub username; select **Public**.
2. Unzip the GitHub-ready file and upload **the contents of the folder** to the root of the repository, including `.github/` and `.gitignore` (on macOS, Finder shortcut `Cmd+Shift+.` shows hidden files). Use Add file > Upload files > Commit changes. Do not upload the ZIP itself.
3. In repository Settings > Pages > Build and deployment > Source, select **GitHub Actions** (not Deploy from a branch).
4. Check the repository's Actions tab for the workflow **Publish mosque website to GitHub Pages**. If it did not run automatically, select it and choose **Run workflow**.
5. Open `https://YOUR-USERNAME.github.io/` when the workflow succeeds. The site will display PREVIEW status, disabled online payments and noindex until the launch blockers are resolved.
6. To update any page, edit the source files on GitHub and commit to `main`; the GitHub Action automatically rebuilds `dist/` and redeploys.

## Release preparation

- After properly verifying every launch item (`npm run check:launch`), set `site.canonicalUrl` in `content/site.json` to your true published URL and confirm the payment provider, ownership, policies and bank details.
- Replace `npm run build` with `npm run build:launch` in `.github/workflows/deploy-pages.yml` only **after** the owner and financial checks are complete.
- Review https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits and the GitHub Pages policies, particularly when using a fundraising-focused website. Donation links are generally permitted, but GitHub Pages is not intended for hosting payment processing or commerce-oriented sites.

## Notes

- The included `.github/workflows/checks.yml` runs independent quality checks; `.github/workflows/deploy-pages.yml` performs the Pages deployment.
- If you prefer to keep source/configuration private with free tools, use a private GitHub repository connected to Cloudflare Pages or Netlify instead.
