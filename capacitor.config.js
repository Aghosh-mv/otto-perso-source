// Otto Perso — Capacitor config
// Wraps the Next.js app into a native Android app.
// The app loads http://localhost:3000 (where the bundled server runs)
// but the user never sees localhost — it's a native Android app.

const config = {
  appId: 'com.ottoperso.app',
  appName: 'Otto Perso',
  webDir: 'out',
  server: {
    // The app runs a local server (bundled Node.js) and loads it
    url: 'http://localhost:3000',
    cleartext: true,
  },
  android: {
    backgroundColor: '#FAFAF9',
    allowMixedContent: true,
  },
  plugins: {
    SplashScreen: {
      backgroundColor: '#FAFAF9',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      androidSpinnerStyle: 'large',
    },
  },
};

module.exports = config;
