# Loglig local sync

Runs on your own PC (no GitHub Actions minutes). Step 1 is read-only exploration; the extractors and the import into this app come after we see the real pages.

1. Put your Loglig login in `scripts/loglig-sync/.env.local` (`LOGLIG_USER`, `LOGLIG_PASSWORD`). The file is git-ignored.
2. From `apps/web`: `pnpm loglig:explore` (add `-- --crawl 40` to follow links, `-- --url "<page>"` for specific pages).
   An Edge window opens, logs in, and saves each page's HTML and screenshot into `apps/web/.loglig-dump/` (git-ignored).
3. Tell Claude when it has finished. The saved pages show how players, competitions, results and rankings look, and the extractors are written from them.

Notes
- It only reads pages (no clicking, no form submits, skips logout/delete links) and waits between pages.
- The dump contains personal data (including minors). Keep it on this PC; do not commit or share it.
- Check Loglig's terms of use for automated access, and tell the federation what you are doing.
