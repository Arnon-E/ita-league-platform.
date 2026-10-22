// Same as app.json, except the API address can be overridden for a development build:
//   $env:ITA_API_URL = "https://<dev-site>"; (then build as usual)
// Without it the app talks to the production site.
module.exports = ({ config }) => ({
  ...config,
  extra: { ...config.extra, apiUrl: process.env.ITA_API_URL || config.extra.apiUrl },
});
