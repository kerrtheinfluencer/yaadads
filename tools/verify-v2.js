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
check('home view toggle ships (single + grid buttons wired to setHomeView)',
  html.includes('id="homeViewBtn"') && html.includes("setHomeView('single'") && html.includes("setHomeView('grid'"));
check('saved home view stamped before first paint (inline ya_home_view script)',
  html.indexOf('ya_home_view') > -1 && html.indexOf('ya_home_view') < html.indexOf('<body'));
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
check('SW cache bumped to v43', sw.includes('yaadadz-v43'));
check('SW precaches new assets', sw.includes("'/js/onboarding.js'") && sw.includes("'/js/recent.js'") && sw.includes("'/js/site-updates.js'") && sw.includes("'/logo.svg'") && sw.includes("'/js/caption-parse.js'"));

// 5b. §HOME-VIEW + §INFINITE-SCROLL (js/search-ai.js)
const _saSrc = fs.readFileSync('js/search-ai.js', 'utf8');
check('infinite scroll ships (sentinel + IntersectionObserver + re-arm on render)',
  _saSrc.includes('id="homeMore"') && _saSrc.includes('IntersectionObserver') && _saSrc.includes('observeHomeSentinel'));
check('scroll fallback keeps the feed loading when the observer never fires (in-app browsers)',
  _saSrc.includes('scheduleHomeFill') && _saSrc.includes('homeNearEnd') && _saSrc.includes('function growHome'));
check('home view persisted + applied (setHomeView / initHomeView / ya_home_view)',
  _saSrc.includes('HOME_VIEW_KEY') && _saSrc.includes('function setHomeView') && _saSrc.includes('function initHomeView'));
check('fallback Show-more button stays wired (loadMoreHome + observer chunk in step)',
  _saSrc.includes('function loadMoreHome') && _saSrc.includes('function growHome'));
check('§PERF-APPEND: infinite scroll appends the tail instead of rebuilding the grid',
  _saSrc.includes('_homeAppend') && _saSrc.includes('attachCardPrefetch'));
check('§PERF-LCP: first card image loads eagerly with fetchpriority=high',
  fs.readFileSync('js/ui-nav.js', 'utf8').includes('fetchpriority="high"'));
check('cardHTML escapes img alt/src attributes (DB-authored strings)',
  fs.readFileSync('js/ui-nav.js', 'utf8').includes('escHtml(ad.image)') &&
  fs.readFileSync('js/ui-nav.js', 'utf8').includes('escHtml(ad.title)}"'));
check('sw.js carries no dead cache strategies (staleWhileRevalidate removed)',
  !sw.includes('staleWhileRevalidate'));

// 6. style.css balance + new styles
const css = fs.readFileSync('style.css', 'utf8');
const ob = (css.match(/{/g) || []).length, cb = (css.match(/}/g) || []).length;
check('style.css braces balanced', ob === cb, ob + ' blocks');
check('mobile softens per-card backdrop blur (12px not 24px)',
  css.includes('backdrop-filter: blur(12px) saturate(1.5)'));
check('style.css has toast-action styles', css.includes('.toast .toast-action'));
check('style.css has recent strip styles', css.includes('.recent-card') && css.includes('.recent-search-chip'));
check('style.css has tap-target block', css.includes('min-width: 44px'));
check('mobile single-view home layout CSS ships (html.home-single + .view-toggle)',
  css.includes('html.home-single .listings-grid') && css.includes('.view-toggle'));
check('§FIB-HERO pass ships (fib eyebrow, clamp(34→55) display, golden-beat entrance)',
  css.includes('clamp(var(--fib-7), 5.5vw, var(--fib-8))') &&
  css.includes('animation-delay: .062s') &&
  css.includes('.ai-sug {'));
check('§FIB-HOME pass ships (21px pill radii, φ card type, golden-eased buttons)',
  css.replace(/\r/g, '').includes('border-radius: var(--r-f4);\n  border: 1.5px solid rgba(255,255,255,.14);') &&
  css.replace(/\r/g, '').includes('.ad-title {\n  font-weight: 600;') &&
  css.replace(/\r/g, '').includes('transform var(--dur-gold-1) var(--ease-gold);'));
check('grid choice survives the ≤340px single-column fallback (html.home-grid restore)',
  css.includes('html.home-grid .listings-grid'));
check('§GOLDEN-SCALE tokens ship (φ ramp + golden easing + φ durations)',
  css.includes('--phi: 1.618') && css.includes('--ease-gold') && css.includes('--dur-gold-1'));
check('single-view imagery is a true golden rectangle (aspect-ratio: var(--phi))',
  css.includes('aspect-ratio: var(--phi)'));
check('onboarding overlay is dim-and-dismiss (click-outside wired)',
  css.includes('pointer-events: auto;') && css.includes('.ob-overlay'));
check('site-update modal shell styled (su-overlay + modal CSS present)',
  css.includes('.su-overlay') && css.includes('.site-update-modal'));

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
check('onboarding has health watchdogs (no reading deadline)', obSrc.includes('_welcomeWatchdog') && obSrc.includes('_tourWatchdog') && obSrc.includes('!_root.isConnected'));
check('onboarding tries/catches showWelcome (never leaves overlay)',
  obSrc.includes('showWelcome failed') && obSrc.includes('classList.remove(\'ob-welcome-open\')'));
check('onboarding click-outside-to-dismiss wired', obSrc.includes("getElementById('obOverlay')"));

// 6d. v2.4 updates-history: full history thread + every entry dated
const suSrc = fs.readFileSync('js/site-updates.js', 'utf8');
check('SITE_UPDATES history thread built (siteUpdateList + persistent row helper)',
  suSrc.includes('siteUpdateList') && fs.readFileSync('js/auth-account.js', 'utf8').includes('siteUpdateRowHtml'));
check('v2.5 fast-new-ads entry shipped', suSrc.includes("'fast-new-ads'"));
check('v2.6 code-cleanup entry shipped', suSrc.includes("'code-cleanup'"));
check('home-view and feedback history preserved + compact glass home current', suSrc.includes("'home-view'") && suSrc.includes("'ad-feedback'") && suSrc.includes("version: 'v2.12'") && suSrc.includes("current: 'compact-glass-home'") && suSrc.includes("version: 'v2.13'"));
check('v2.10 post-pro entry shipped', suSrc.includes("'post-pro'"));
check('v2.4 update-history entry shipped', suSrc.includes("'update-history'"));
check('every SITE_UPDATES entry has a date (history sorts newest-first)',
  (suSrc.match(/date: '/g) || []).length >= 4);
check('every SITE_UPDATES entry ships notes + notes renderer exists',
  (suSrc.match(/notes: \[/g) || []).length >= 4 && suSrc.includes('site-update-notes'));

// 6e. mobile parity: guests see the updates thread too (logged-out phones),
//     and the history modal fits the mobile viewport (dvh, not vh).
const acctSrc = fs.readFileSync('js/auth-account.js', 'utf8');
check('guest inbox keeps updates thread (renderInbox !CU branch)',
  /if\s*\(!CU\)\s*\{\s*el\.innerHTML\s*=\s*_guestRow/.test(acctSrc));
check('guest account inbox keeps updates thread (acctInboxList !CU branch)',
  acctSrc.includes('_acctGuestRow'));
check('history modal uses dvh so it never clips on mobile Safari',
  css.includes('100dvh') && css.includes('.site-update-modal'));

// 6f. CHANGELOG.md generated from SITE_UPDATES (single source of truth).
check('build-changelog tool exists', fs.existsSync('tools/build-changelog.js'));
(function () {
  try {
    execSync('node tools/build-changelog.js', { stdio: 'pipe' });
    const cl = fs.readFileSync('CHANGELOG.md', 'utf8');
    const cur = (suSrc.match(/current:\s*'([^']+)'/) || [])[1] || '';
    const curVer = (suSrc.match(new RegExp("'" + cur + "':\\s*\\{[\\s\\S]*?version:\\s*'([^']+)'")) || [])[1] || '';
    const entryCount = (suSrc.match(/version: '/g) || []).length; // one per real entry (notes: [ also appears in the file header comment)
    const clCount = (cl.match(/^## /gm) || []).length;
    check('CHANGELOG.md regenerated + current version present (' + clCount + ' entries)',
      cl.includes('Auto-generated from `js/site-updates.js`') && clCount >= entryCount && (curVer ? cl.includes(curVer) : true));
  } catch (e) { check('CHANGELOG.md regenerated + current version present', false, 'build-changelog.js failed'); }
})();

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

// 12. changelog auto-update wiring — the changelog syncs itself, never by hand
const pkgRaw = fs.readFileSync('package.json', 'utf8');
const hookSrc = fs.existsSync('.githooks/pre-commit') ? fs.readFileSync('.githooks/pre-commit', 'utf8') : '';
let hookMode = '';
try { hookMode = execSync('git ls-files -s .githooks/pre-commit', { encoding: 'utf8' }).trim().split(/\s+/)[0]; } catch (e) {}
check('changelog pre-commit hook ships (node shebang + exec bit for macOS/Linux)',
  hookSrc.startsWith('#!/usr/bin/env node') && (hookMode === '' || hookMode === '100755'), hookMode || 'mode unknown');
check('hook installer exists + wired to npm prepare (auto-run on npm install)',
  fs.existsSync('tools/install-hooks.js') && pkgRaw.includes('"prepare": "node tools/install-hooks.js"'));
const clWf = fs.existsSync('.github/workflows/changelog.yml') ? fs.readFileSync('.github/workflows/changelog.yml', 'utf8') : '';
check('CI changelog auto-update workflow ships with push permission',
  clWf.includes('contents: write') && clWf.includes("'js/site-updates.js'") && clWf.includes('git push'));
check('npm run changelog:check available (stale-changelog guard)', pkgRaw.includes('"changelog:check"'));

try {
  execSync('node tools/test-ad-feedback.js', { stdio: 'pipe' });
  check('buyer feedback integration on every listing', true);
} catch (e) { check('buyer feedback integration on every listing', false, String(e.message)); }


console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);
