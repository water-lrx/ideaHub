/**
 * Android packaging config for the standalone app.
 *
 * The web assets are plain static files (no bundler), assembled into `www/` by
 * `npm run build:www`. The Android build ships the UI only: there is no HTTP
 * service, so the app stores everything in the WebView's own storage and talks
 * to the model provider directly with the API key each user enters themselves.
 */
const config = {
  appId: "local.ideahub.app",
  appName: "IdeaHub",
  webDir: "www",
  android: {
    // The UI is fully local; nothing needs to be served over http.
    allowMixedContent: false,
  },
  server: {
    androidScheme: "https",
  },
};

module.exports = config;
