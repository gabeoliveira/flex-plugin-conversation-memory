// Plugin config for local development. Copy this to `appConfig.js` and set your
// real Account SID. `appConfig.js` is gitignored (like `.env`) so the SID never
// gets committed. `twilio flex:plugins:start` reads `appConfig.js`.
//
// IMPORTANT: accountSid must be your real Twilio Account SID. The Flex local
// dev shell uses it to fetch the account's public config — a placeholder here
// causes a 400 from /v1/Configuration/Public and breaks Flex on boot.
var appConfig = {
  pluginService: {
    enabled: true,
    url: '/plugins',
  },
  sso: {
    accountSid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  },
  ytica: false,
  logLevel: 'info',
};
