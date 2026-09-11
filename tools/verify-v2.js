/* ── v2 verification suite (run: node tools/verify-v2.js) ── */
const fs = require('fs');
const { execSync } = require('child_process');

let failures = 0;
function check(name, ok, extra) {
  console.log((ok ? '[PASS] ' : '[FAIL] ') + name + (extra ? ' — ' + extra : ''));
  if (!ok) failures++;
}

// 1. index.html wiring
const html = fs.readFileSync('index.html', 'utf8');
// defer-agnostic: matches <script src="js/onboarding.js"></script> or with defer
check('onboarding.js included in index.html', /<script src="js\/onboarding\.js"( defer)?><\/script>/.test(html));
  check('site-updates.js included in index.html', /<script src="js\/site-updates\.js"( defer)?><\/script>/.test(html));
check('recent.js included in index.html', /<script src="js\/recent\.js"( defer)?><\/script>/.test(html));
check('script order: onboarding before boot.js',
  html.indexOf('js/onboarding.js') < html.indexOf('js/boot.js') && html.indexOf('js/recent.js') < html.indexOf('js/boot.js'));
check('Replay Tour link present', html.includes('startOnboarding();return false'));
check('no maximum-scale in viewport', !html.includes('maximum-scale'));
check('no stray closing script tag after boot.js', !/<script src="js\/boot\.js"><\/script>\s*<\/script>/.test(html));
check('recentStrip container present', html.includes('id="recentStrip"'));
check('recentSearchRow container present', html.includes('id="recentSearchRow"'));
check('logo.svg referenced 3 times', (html.match(/src="\/logo\.svg"/g) || []).length === 3);
check('manifest linked', html.includes('rel="manifest"'));
check('member stat starts as a neutral placeholder, not zero',
  /id="uStat"[^>]*>—<\/div>/.test(html));

// 2. script tag balance in index.html
const opens = (html.match(/<script\b/g) || []).length;
const closes = (html.match(/<\/script>/g) || []).length;
check('script tags balanced', opens === closes, opens + ' vs ' + closes);

// 3. inline script blocks parse
const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
let inlineOk = true;
inlineScripts.forEach((m, i) => {
  try { new Function(m[1]); } catch (e) { inlineOk = false; console.log('   inline block ' + i + ' error: ' + e.message); }
});
check('all inline script blocks parse (' + inlineScripts.length + ' blocks)', inlineOk);

// 4. manifest
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
check('manifest valid JSON', true);
check('manifest has 3 shortcuts', manifest.shortcuts && manifest.shortcuts.length === 3);
check('manifest has maskable icons', manifest.icons.some(i => (i.purpose || '').includes('maskable')));

// 5. sw.js
const sw = fs.readFileSync('sw.js', 'utf8');
check('SW cache bumped to v20', sw.includes('yaadadz-v20'));
check('SW precaches new assets', sw.includes("'/js/onboarding.js'") && sw.includes("'/js/recent.js'") && sw.includes("'/js/site-updates.js'") && sw.includes("'/logo.svg'"));

// 6. style.css balance + new styles
const css = fs.readFileSync('style.css', 'utf8');
const ob = (css.match(/{/g) || []).length, cb = (css.match(/}/g) || []).length;
check('style.css braces balanced', ob === cb, ob + ' blocks');
check('style.css has toast-action styles', css.includes('.toast .toast-action'));
check('style.css has recent strip styles', css.includes('.recent-card') && css.includes('.recent-search-chip'));
check('style.css has tap-target block', css.includes('min-width: 44px'));
check('onboarding overlay is dim-and-dismiss (click-outside wired)',
  css.includes('pointer-events: auto;') && css.includes('.ob-overlay'));

// 6b. matchMedia guard present across app JS + no unguarded calls anywhere
const uiNav = fs.readFileSync('js/ui-nav.js', 'utf8');
const coreSrc2 = fs.readFileSync('js/core.js', 'utf8');
check('member count uses public profiles exact count, not a missing RPC',
  !uiNav.includes("rpc('get_user_count')") &&
  uiNav.includes("from('profiles').select('id', { count: 'exact', head: true })"));
const UNGUARDED_MATCHMEDIA =
  /(?<!typeof window\.matchMedia === 'function' && )window\.matchMedia\('\(display-mode: standalone\)'\)\.matches/;
check('ui-nav guards matchMedia (no boot crash on iOS/Firefox)',
  uiNav.includes("typeof window.matchMedia === 'function'"));
check('core.js guards matchMedia',
  coreSrc2.includes("typeof window.matchMedia === 'function'"));
let unguardedFiles = [];
for (const sub of fs.readdirSync('.')) {
  if (!sub.endsWith('.html')) continue;
  const c = fs.readFileSync(sub, 'utf8');
  if (UNGUARDED_MATCHMEDIA.test(c)) unguardedFiles.push(sub);
}
for (const d of ['ad', 'category', 'parish']) {
  const dir = d;
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    if (!f.endsWith('.html')) continue;
    const c = fs.readFileSync(dir + '/' + f, 'utf8');
    if (UNGUARDED_MATCHMEDIA.test(c)) unguardedFiles.push(dir + '/' + f);
  }
}
check('no unguarded matchMedia in any HTML page (' + unguardedFiles.length + ' flagged)',
  unguardedFiles.length === 0, unguardedFiles.slice(0, 3).join(', '));

// 6c. onboarding watchdog present (stuck overlay impossible)
const obSrc = fs.readFileSync('js/onboarding.js', 'utf8');
check('onboarding has watchdog auto-dismiss', obSrc.includes('_welcomeWatchdog') && obSrc.includes('_tourWatchdog'));
check('onboarding tries/catches showWelcome (never leaves overlay)',
  obSrc.includes('showWelcome failed') && obSrc.includes('classList.remove(\'ob-welcome-open\')'));
check('onboarding click-outside-to-dismiss wired', obSrc.includes("getElementById('obOverlay')"));

// 7. JS modules syntax
for (const f of fs.readdirSync('js')) {
  if (!f.endsWith('.js')) continue;
  try { execSync('node --check js/' + f, { stdio: 'pipe' }); check('js/' + f + ' syntax', true); }
  catch (e) { check('js/' + f + ' syntax', false, e.stderr.toString().split('\n')[0]); }
}

// 8. key dedupe
const adSocial = fs.readFileSync('js/ad-social.js', 'utf8');
check('ad-social.js uses CFG (no hardcoded key)', !adSocial.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'));
check('core.js still has CFG (single source)', fs.readFileSync('js/core.js', 'utf8').includes('CFG = {'));

// 9. generate-pages template
const gp = fs.readFileSync('generate-pages.js', 'utf8');
check('generate-pages: fetchpriority on featured img', gp.includes('fetchpriority="high"'));
check('generate-pages: gas link in landing footer', gp.includes('/gas-prices.html'));

// 10. gas-prices page
const gas = fs.readFileSync('gas-prices.html', 'utf8');
check('gas page share button present', gas.includes('id="shareBtn"'));
check('gas page relative time logic', gas.includes('days ago'));

// 11. files
check('supabase.d.ts removed', !fs.existsSync('supabase.d.ts'));
check('todo.md roadmap written', fs.statSync('todo.md').size > 500);
check('logo.svg exists', fs.existsSync('logo.svg') && fs.statSync('logo.svg').size > 5000);

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);
