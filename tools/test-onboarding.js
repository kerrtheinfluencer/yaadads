'use strict';
// Requires installed Chrome/Edge (or BROWSER_PATH). No npm browser dependency.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFile } = require('child_process');
const { promisify } = require('util');
const run = promisify(execFile);
const root = path.resolve(__dirname, '..');
const candidates = [process.env.BROWSER_PATH,
  process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
  process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft/Edge/Application/msedge.exe'),
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
const browser = candidates.find(p => p && fs.existsSync(p));
const assets = {
  '/tools/test-onboarding.html': ['tools/test-onboarding.html', 'text/html'],
  '/js/onboarding.js': ['js/onboarding.js', 'text/javascript'],
  '/style.css': ['style.css', 'text/css'],
};
async function main() {
  if (!browser) throw Error('Install Chrome/Edge or set BROWSER_PATH to its executable.');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'yaad-onboarding-'));
  const server = http.createServer((req, res) => {
    const asset = assets[new URL(req.url, 'http://localhost').pathname];
    if (!asset) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': asset[1] + '; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(path.join(root, asset[0])));
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    for (const mode of ['first', 'returning', 'blocked']) {
      const args = ['--headless=new', '--disable-gpu', '--no-first-run',
        '--user-data-dir=' + path.join(temp, mode), '--window-size=1280,900',
        '--virtual-time-budget=20000', '--dump-dom',
        `http://127.0.0.1:${server.address().port}/tools/test-onboarding.html?mode=${mode}`];
      if (process.platform === 'linux' && process.getuid && process.getuid() === 0) args.unshift('--no-sandbox');
      const { stdout } = await run(browser, args, { timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
      const match = stdout.match(/<pre\b[^>]*id="out"[^>]*>([\s\S]*?)<\/pre>/);
      const text = match ? match[1] : '';
      if (!text.startsWith('ONBOARDING: PASS') || !stdout.includes('data-test-complete="true"') ||
          !text.includes('watchdog releases scroll lock if tour root is removed') || /"ok"\s*:\s*false/.test(text)) {
        throw Error(mode + ': browser tests failed or did not finish\n' + text);
      }
      console.log(`[PASS] onboarding ${mode}: ${(text.match(/"ok": true/g) || []).length} checks`);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
    try { fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
    catch (e) { console.warn('Could not remove browser test profile: ' + e.message); }
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
