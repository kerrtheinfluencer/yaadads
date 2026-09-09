/* ── Headless clickability doctor runner.
   Usage: node tools/run-doctor.js [desktop|mobile]   (default: desktop)
   Boots the app in a fresh Edge profile, clicks Skip on the welcome modal,
   closes the tour, and reports whether the page is clickable.
   Requires Edge at the default path (edit EDGE below if needed). ── */
const fs = require('fs');
const { execSync } = require('child_process');
const os = require('os');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const MODE = process.argv[2] === 'mobile' ? 'mobile' : 'desktop';

const tmp = os.tmpdir();
const prof = path.join(tmp, 'yaad-doctor-' + Math.floor(Math.random() * 1e9));

const url = 'http://localhost:8888/tools/test-clickability.html?mode=' + MODE;
const args = [
  '--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
  '--user-data-dir=' + prof,
  '--virtual-time-budget=60000', '--timeout=75000',
  '--dump-dom', url,
];

let raw = '';
try {
  // execSync is the reliable cross-platform spawn; Edge prints the DOM to stdout.
  raw = execSync('"' + EDGE + '" ' + args.map(a => JSON.stringify(a)).join(' '), {
    timeout: 90000,
    encoding: 'utf8',
    windowsHide: true,
  });
} catch (e) {
  raw = (e && e.stdout) || '';
}

const m = raw.match(/DOCTOR_TITLE:(\{.*?\})/);
if (!m) {
  console.log('NO_DOCTOR_RESULT (dump bytes=' + raw.length + ')');
  process.exit(1);
}
const res = JSON.parse(m[1]);
console.log('=== ' + MODE.toUpperCase() + ' DOCTOR ===');
for (const [k, v] of Object.entries(res)) console.log('  ' + k + ': ' + JSON.stringify(v));
console.log('=== ' + (res.pageClickable ? 'PAGE CLICKABLE ✓' : 'PAGE BLOCKED ✗') + ' ===');
process.exit(res.pageClickable ? 0 : 1);