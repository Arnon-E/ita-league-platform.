// Lets the sync scripts push to the development site, which sits behind Vercel's Deployment Protection:
//   $env:VERCEL_BYPASS = "<Protection Bypass for Automation secret>"; $env:CRON_SECRET = "<the development CRON_SECRET>"
//   node --import ./scripts/loglig-sync/_bypass.mjs scripts/loglig-sync/rankings.mjs --push --url https://<dev-site>
// Only requests to *.vercel.app get the header; reads from ita.co.il and loglig.com are left alone.
const secret = process.env.VERCEL_BYPASS;
if (secret) {
  const orig = globalThis.fetch;
  globalThis.fetch = (input, init = {}) => {
    const url = String(input?.url ?? input);
    if (/\.vercel\.app/.test(url)) {
      const h = new Headers(init.headers);
      h.set('x-vercel-protection-bypass', secret);
      init = { ...init, headers: h };
    }
    return orig(input, init);
  };
}
