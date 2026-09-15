/* ── install-hooks.js (run: node tools/install-hooks.js / npm run hooks:install) ──
 * Points git at the versioned .githooks directory so CHANGELOG.md auto-updates
 * on every commit (see .githooks/pre-commit). Wired to npm's "prepare" script,
 * so a plain `npm install` enables it — no manual git config needed.
 *
 * Safe everywhere: non-git folders (zip downloads, CI build dirs) and missing
 * git binaries are reported and skipped, never fatal. Always exits 0. */
'use strict';
const { execFileSync } = require('child_process');

const HOOKS_DIR = '.githooks';

try {
  const inside = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  if (inside !== 'true') throw new Error('not a git working tree');

  execFileSync('git', ['config', 'core.hooksPath', HOOKS_DIR], { stdio: 'ignore' });
  console.log('[hooks] core.hooksPath = ' + HOOKS_DIR + ' — CHANGELOG.md now auto-updates on every commit.');
} catch (e) {
  console.log('[hooks] skipped (' + String((e && e.message) || e).split('\n')[0] + ') — no pre-commit changelog sync here.');
}
process.exit(0);