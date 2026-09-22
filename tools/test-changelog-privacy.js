/* Offline regression tests. Synthetic credentials only; never print fixtures. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { assertPublicNotes } = require('./changelog-privacy');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'yaad-changelog-test-'));
const token = 'ghp_' + 'a'.repeat(36);
const clean = "var SITE_UPDATES = { current: 'sample', items: { 'sample': { version: 'v1', title: 'Clearer listings', body: 'Easier browsing', date: 'Sep 17, 2026', notes: ['Larger photos'], url: '/' } } };";
function run(command, args) {
  return spawnSync(command, args, { cwd: temp, encoding: 'utf8', timeout: 20000 });
}
function ok(result) { assert.equal(result.status, 0, 'command should succeed'); }
function blocked(result) {
  assert.equal(result.status, 1, 'unsafe notes must fail closed');
  assert.ok(!(result.stdout + result.stderr).includes(token), 'fixture must not be logged');
}
try {
  for (const value of [token, 'Bearer ' + 'a'.repeat(24), 'password=synthetic-only',
    'internal-migration.sql', 'C:\\Users\\example\\private',
    'postgres://example:synthetic@localhost/db', '-----BEGIN PRIVATE KEY-----']) {
    assert.throws(() => assertPublicNotes(value), /privacy validation/);
  }
  assert.doesNotThrow(() => assertPublicNotes('Reset your password. Visit https://yaadadz.com/help'));
  for (const dir of ['tools', 'js', '.githooks']) fs.mkdirSync(path.join(temp, dir));
  for (const file of ['tools/build-changelog.js', 'tools/changelog-privacy.js', '.githooks/pre-commit']) {
    fs.copyFileSync(path.join(root, file), path.join(temp, file));
  }
  const source = path.join(temp, 'js/site-updates.js');
  const output = path.join(temp, 'CHANGELOG.md');
  fs.writeFileSync(source, clean);
  ok(run(process.execPath, ['tools/build-changelog.js']));
  const expected = fs.readFileSync(output, 'utf8');
  assert.ok(expected.includes('Clearer listings'));
  // Validate comments/metadata too, not just rendered body text.
  fs.writeFileSync(source, clean + '\n// ' + token);
  blocked(run(process.execPath, ['tools/build-changelog.js']));
  assert.equal(fs.readFileSync(output, 'utf8'), expected, 'failure must not overwrite output');
  ok(run('git', ['init', '--quiet']));
  ok(run('git', ['add', 'js/site-updates.js', 'CHANGELOG.md']));
  fs.writeFileSync(source, clean); // Staged source is still unsafe.
  blocked(run(process.execPath, ['.githooks/pre-commit']));
  ok(run('git', ['add', 'js/site-updates.js']));
  ok(run(process.execPath, ['.githooks/pre-commit']));
  fs.writeFileSync(output, token);
  ok(run('git', ['add', 'CHANGELOG.md']));
  blocked(run(process.execPath, ['.githooks/pre-commit']));
  console.log('PASS: public copy allowed; unsafe source/staged notes blocked; output and logs protected.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
