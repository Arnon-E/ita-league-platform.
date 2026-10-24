// Same as app.json, except for a development build (install-dev.bat sets these; install-prod.bat leaves them out, so the app talks to the production site):
//   ITA_API_URL    the development site
//   ITA_API_BYPASS Vercel's "Protection Bypass for Automation" secret of the development site, sent as a header (never committed)
module.exports = ({ config }) => ({
  ...config,
  extra: { ...config.extra, apiUrl: process.env.ITA_API_URL || config.extra.apiUrl, apiBypass: process.env.ITA_API_BYPASS || undefined },
});
