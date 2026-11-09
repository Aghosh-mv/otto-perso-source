/**
 * Otto Perso — Node.js Mobile Server
 * 
 * This file runs inside the Android app using nodejs-mobile.
 * It starts the Next.js server on localhost:3000.
 * The React Native WebView then loads this server.
 */

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

// The Next.js app is bundled inside the APK
const app = next({ dev: false });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  server.listen(3000, 'localhost', (err) => {
    if (err) throw err;
    console.log('[Otto] Server ready on http://localhost:3000');
  });
});
