/* ── Minimal zero-dependency static dev server for local testing.
   Usage: node tools/dev-server.js [port]   (default 8888)
   Serves the repo root like GitHub Pages would (index.html for /,
   extensionless → .html fallback), with no-store so you always
   see fresh files while iterating. ── */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8888);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
};

http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
    if (urlPath.endsWith('/')) urlPath += 'index.html';
    let filePath = path.normalize(path.join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      const withHtml = filePath + '.html';
      if (fs.existsSync(withHtml)) filePath = withHtml;
      else {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>404 — dev server</h1><p><a href="/">← Home</a></p>');
        return;
      }
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(filePath).pipe(res);
  } catch (e) {
    res.writeHead(500); res.end('Server error: ' + e.message);
  }
}).listen(PORT, () => {
  console.log('Yaad Adz dev server running → http://localhost:' + PORT);
  console.log('Press Ctrl+C to stop.');
});