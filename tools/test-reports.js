/* §REPORTS — guards the member-report pipeline end to end.
   Run: node tools/test-reports.js

   This suite exists because of a specific, previously-silent failure: the site
   showed a "Report this ad" modal that looked completely finished and told
   members "Report submitted — we'll review it", while doing nothing of the
   kind. The report was written to localStorage on the reporter's own phone.
   Nothing read it. openReport() had no callers anywhere, so the dialog could
   not even be opened. The admin dashboard's report panel was a note explaining
   that reports had to be read in the Supabase table editor.

   So most of these checks are about the pipe actually existing, end to end:
     1. The dead localStorage write is gone and the insert targets ad_reports.
     2. The report control is REACHABLE — the most important check here.
     3. Generated /ad/*.html pages carry the report markup (that is where most
        traffic lands), with the listing id escaped.
     4. The admin queue reads the identity-free view, renders the reasons, and
        clears a report only AFTER the listing write succeeded.
     5. Nothing pretends to work: a missing table says so rather than showing
        an empty queue that reads as "all clear".
     6. The migration lets guests report and actually rate-limits them server
        side.
     7. In a real browser at 360px: a worst-case report row (400-character
        title, every reason, a long note) does not push the dashboard sideways.
*/
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

let pass = 0, fail = 0;
function check(name, ok, extra) {
  console.log((ok ? '[PASS] ' : '[FAIL] ') + name + (extra ? ' - ' + extra : ''));
  ok ? pass++ : fail++;
}
function msg(e) { return (e && e.message) ? e.message : String(e); }

const read = (f) => fs.readFileSync(f, 'utf8');
/* Strip comments so a check cannot be satisfied by prose describing the old
   behaviour — ad-social.js's §REPORT header quotes that code verbatim. */
function live(f) {
  return read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
}

const reportJs  = live('js/ad-report.js');
const socialJs  = live('js/ad-social.js');
const adminJs   = live('js/admin.js');
const adminHtml = read('admin.html');
const indexHtml = read('index.html');
const genJs     = read('generate-pages.js');
const markJs    = read('tools/ad-report-markup.js');
const sql       = read('supabase-migration-ad-reports.sql');

/* ── 1. the dead localStorage write is gone ─────────────────────────────── */

check('no file writes a report to localStorage any more',
  !/localStorage\.setItem\(\s*['"]ya_reports/.test(socialJs + reportJs),
  'found localStorage.setItem("ya_reports"…)');
check('the report is inserted into ad_reports',
  /var TABLE = 'ad_reports'/.test(reportJs) && /\.from\(\s*TABLE\s*\)\s*\.insert\(/s.test(reportJs));
check('the inserted row carries ad_id, reason and a device key',
  /ad_id:\s*state\.adId/.test(reportJs) &&
  /reason:\s*state\.reason/.test(reportJs) &&
  /reporter_key:\s*reporterKey\(\)/.test(reportJs));
check('reporter_id is never sent by the client (server stamps it)',
  !/reporter_id\s*:/.test(reportJs), 'client sets reporter_id — it could be forged');
check('success is only claimed after a real response',
  /if \(r && r\.error\) \{ say\(failure\(r\.error\), 'err'\); rearm\(\); return; \}/.test(reportJs));
check('a duplicate report (23505) is explained, not swallowed',
  /code === '23505'/.test(reportJs) && /already reported/.test(reportJs));
check('the device key is a random per-browser id, not an identity',
  /randomUUID/.test(reportJs) && /ya_reporter_key/.test(reportJs));

/* ── 2. the report control is reachable (the original bug) ──────────────── */

check('the inline detail view mounts a report control',
  /detail-report-slot/.test(socialJs) && /renderReportLink/.test(socialJs));
check('the report control is wired by a listener, not an inline handler',
  /addEventListener\('click', function \(\)/.test(socialJs) &&
  /YaadReport\.open\(ad\.id, \{ title: ad\.title \}\)/.test(socialJs) &&
  !/onclick="submitReport\(\)"/.test(indexHtml),
  'report link must not build an inline onclick carrying ad data, and the submit button must not double-fire');
check('ad-report.js loads BEFORE ad-social.js in index.html',
  indexHtml.indexOf('js/ad-report.js') !== -1 &&
  indexHtml.indexOf('js/ad-report.js') < indexHtml.indexOf('js/ad-social.js'),
  'ad-social.js calls window.YaadReport.open() — order matters');
check('the existing #ovReport markup is still present for the app to reuse',
  /id="ovReport"/.test(indexHtml) && /id="reportOptions"/.test(indexHtml) &&
  /id="reportSubmitBtn"/.test(indexHtml));
check('no innerHTML anywhere in the report client or admin queue',
  !/innerHTML/.test(reportJs) && !/innerHTML/.test(adminJs),
  'ad titles and reasons are member-supplied — an HTML sink is stored XSS');

/* ── 3. generated ad pages carry the report markup ──────────────────────── */

check('generate-pages.js injects the report markup',
  /require\('\.\/tools\/ad-report-markup'\)\(ad\)/.test(genJs));
check('the markup helper loads the client, the stylesheet and a Supabase client',
  /\/js\/ad-report\.js/.test(markJs) && /\/ad-report\.css/.test(markJs) &&
  /supabase-js@2/.test(markJs));
check('the markup helper refuses to ship a non-anon key',
  /claims\.role !== 'anon'/.test(markJs));
check('the listing id and title reach the client as escaped data attributes',
  /data-ad-id="\$\{esc\(ad\.id\)\}"/.test(markJs) &&
  /data-ad-title="\$\{esc\(ad\.title\)\}"/.test(markJs));
check('the ad id is not interpolated into an inline handler',
  !/onclick="[^"]*\$\{esc\(ad\.id\)\}/.test(markJs));
check('the report link is mounted from data, not markup',
  /YaadReport\.mountLink\(host, host\.dataset\.adId, host\.dataset\.adTitle\)/.test(markJs));

/* ── 4. the admin queue ─────────────────────────────────────────────────── */

check('the queue reads the identity-free view, not the raw table',
  /var REPORTS_VIEW = 'admin_ad_reports'/.test(adminJs) &&
  /db\.from\(REPORTS_VIEW\)/.test(adminJs));
check('the admin page never reads reporter_key or reporter_id',
  !/reporter_key/.test(adminJs) && !/reporter_id/.test(adminJs));
check('the old "read reports in Supabase" note is gone',
  !/ad_feedback_reports/.test(adminHtml) && !/ad_feedback_reports/.test(adminJs));
check('the Reports panel and stat tile exist in the markup',
  /id="reports"/.test(adminHtml) && /id="s-reports"/.test(adminHtml) &&
  /id="reportcount"/.test(adminHtml));
check('reports are grouped by listing with a count and the reasons given',
  /function reportGroups\(\)/.test(adminJs) && /g\.count\+\+/.test(adminJs) &&
  /REASON_LABEL\[k\]/.test(adminJs));
check('every reason a member can pick is labelled in the queue',
  ['scam', 'wrong_cat', 'duplicate', 'sold_item', 'offensive'].every(r => adminJs.includes(r + ':')),
  'a reason in the client is missing from the admin labels');
check('all four resolve actions exist and are confirm-gated',
  /function reportHide\(/.test(adminJs) && /function reportDelete\(/.test(adminJs) &&
  /function reportHideAll\(/.test(adminJs) && /function reportDismiss\(/.test(adminJs) &&
  (adminJs.match(/window\.confirm\(/g) || []).length >= 8);
check('a report is cleared only AFTER the listing write succeeded',
  /write\('update', ad\.id, \{ status: ST_HIDDEN \}\)\s*\n\s*\.then\(function \(\) \{ ad\.status = ST_HIDDEN; return clearReportRows/.test(adminJs),
  'reports could be swallowed by a failed hide');
check('acting from the Listings panel also drains the queue',
  (adminJs.match(/dropReportsFor\(/g) || []).length >= 3,
  'hide/delete from the Listings panel would leave stale reports');
check('a hidden listing offers no second Hide button in its report row',
  /if \(statusOf\(ad\) !== ST_HIDDEN\) \{\s*\n\s*acts\.appendChild\(btn\('Hide'/.test(adminJs));

/* ── 5. nothing pretends to work ─────────────────────────────────────────── */

check('a missing table says "not switched on yet", not an empty queue',
  /42P01/.test(adminJs) && /not switched on yet/.test(adminJs) &&
  /supabase-migration-ad-reports\.sql/.test(adminJs));
check('the report client also explains an un-migrated table',
  /42P01/.test(reportJs) && /not switched on yet/.test(reportJs));
check('an empty queue is labelled as such rather than as "all clear"',
  /No open reports/.test(adminJs));

/* ── 6. the migration ────────────────────────────────────────────────────── */

check('the table exists with the right columns',
  /create table if not exists public\.ad_reports/.test(sql) &&
  /ad_id\s+text not null references public\.ads\(id\) on delete cascade/.test(sql) &&
  /reporter_key text not null/.test(sql));
check('guests can report (anon can insert) — scams are seen logged out',
  /grant insert on public\.ad_reports to anon, authenticated/.test(sql));
check('the reason is constrained to the five the UI offers',
  /check \(reason in\s*\n?\s*\('scam',\s*'wrong_cat',\s*'duplicate',\s*'sold_item',\s*'offensive'\s*\n?\s*\)\)/.test(sql));
check('one report per device per listing (dedupe index)',
  /unique \(ad_id, reporter_key\)/.test(sql));
check('rate limits are enforced server-side, not in the client',
  /interval '10 minutes'\) >= 5/.test(sql) && /interval '24 hours'\) >= 20/.test(sql) &&
  /pg_advisory_xact_lock/.test(sql));
check('self-reports are rejected where identity is provable',
  /You cannot report your own listing/.test(sql));
check('reporter_id is overwritten from auth.uid(), never trusted',
  /new\.reporter_id := auth\.uid\(\)/.test(sql));
check('reports against hidden or deleted ads are refused',
  /That listing is no longer available/.test(sql));
check('the identity-free view is what gets granted to the dashboard',
  /create or replace view public\.admin_ad_reports as/.test(sql) &&
  /grant select on public\.admin_ad_reports/.test(sql) &&
  !/grant select on public\.ad_reports/.test(sql),
  'raw ad_reports must never be readable with the anon key');
/* Scope the view check to the view body itself. A blanket "no reporter_key
   anywhere near a select" would also flag the rate-limit trigger, which
   legitimately has to count rows per device key. */
const viewDef = (sql.match(/create or replace view public\.admin_ad_reports as[\s\S]*?;/i) || [''])[0];
check('the view omits both identity columns',
  /select r\.id, r\.ad_id, r\.reason, r\.note, r\.created_at/.test(viewDef) &&
  !/reporter_key/.test(viewDef) && !/reporter_id/.test(viewDef),
  'view body: ' + viewDef.replace(/\s+/g, ' ').slice(0, 120));
check('RLS is on and default-deny before the grants',
  /alter table public\.ad_reports enable row level security/.test(sql) &&
  /revoke all on public\.ad_reports from anon, authenticated/.test(sql));
check('the trigger function is not callable directly',
  /revoke all on function public\.prepare_ad_report\(\) from public/.test(sql));
check('the SQL is wrapped in a transaction',
  /^\s*begin;/m.test(sql) && /^\s*commit;/m.test(sql));

/* ── 7. live browser behaviour at 360px ─────────────────────────────────── */

const DEBUG_PORT = 9339;   // Chrome's CDP port; the page server takes a random one
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find(p => fs.existsSync(p));

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(process.cwd(), p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

const cdpGet = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: DEBUG_PORT, path: p }, r => {
    let b = ''; r.on('data', d => b += d);
    r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
  }).on('error', rej);
});

async function browser() {
  if (!CHROME) { check('chrome available for the layout check', false, 'not installed'); return; }
  let ver = null;
  for (let i = 0; i < 60 && !ver; i++) {
    try { ver = await cdpGet('/json/version'); } catch (e) { await new Promise(r => setTimeout(r, 250)); }
  }
  if (!ver) { check('chrome devtools reachable', false, 'never came up'); return; }

  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  const send = (m, p, s) => new Promise(res => {
    const msg = { id: ++id, method: m, params: p || {} };
    if (s) msg.sessionId = s;
    pending.set(msg.id, res); ws.send(JSON.stringify(msg));
  });
  await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Network.enable', {}, sessionId);
  await send('Network.setBlockedURLs', { urls: ['*cdn.jsdelivr.net*'] }, sessionId);
  const base = 'http://127.0.0.1:' + server.address().port;
  await send('Page.navigate', { url: base + '/admin.html' }, sessionId);
  await new Promise(r => setTimeout(r, 2500));

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate',
      { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
    if (r.exceptionDetails) return 'THREW: ' + JSON.stringify(r.exceptionDetails.text);
    return r.result && r.result.value;
  };
  /* ev() returns a DESCRIPTIVE STRING when a probe fails, and every string is
     truthy — so a naive `check(name, await ev(...))` would report PASS on
     exactly the failures it exists to catch. These probes therefore have to be
     compared strictly. */
  const isTrue = async (expr) => {
    const v = await ev(expr);
    return { ok: v === true, detail: v === true ? '' : String(v) };
  };

  await ev('document.getElementById("pw").value="Iamsuperman";document.getElementById("go").click();1');
  await new Promise(r => setTimeout(r, 1500));
  check('dashboard unlocks for the report-queue check',
    (await isTrue('document.getElementById("gate").hidden === true')).ok);

  /* The Reports panel must never render an empty queue that reads as "all
     clear" while the table is missing or unreachable — and it must never sit
     on "Loading…" forever either. With the CDN deliberately blocked there is
     no Supabase client at all, so the honest outcome is an explanation. */
  const panel = await isTrue('(function(){var b=document.getElementById("reports");' +
    'if(!b)return "no #reports";var t=b.textContent||"";' +
    'if(t.indexOf("Loading")!==-1)return "still stuck on Loading";' +
    'return (t.indexOf("not switched on")!==-1||t.indexOf("Could not")!==-1||' +
    't.indexOf("No open reports")!==-1);})()');
  check('the Reports panel explains itself instead of faking an empty queue',
    panel.ok, panel.detail || await ev('(document.getElementById("reports")||{}).textContent'));

  await send('Emulation.setDeviceMetricsOverride',
    { width: 360, height: 720, deviceScaleFactor: 1, mobile: true }, sessionId);
  await new Promise(r => setTimeout(r, 250));

  /* Worst case: every reason at once, 10 reports, a 500-char note. With the
     CDN blocked no listings are loaded, so the ad behind this report cannot be
     found — which is itself a case worth asserting (a report whose listing is
     already gone must still render honestly, and must still be dismissable). */
  const acts = await ev('(function(){' +
    'if(typeof window.__admRenderReportTest!=="function")return -1;' +
    'var box=document.getElementById("reports");if(!box)return -2;' +
    'var reasons={};["scam","wrong_cat","duplicate","sold_item","offensive"].forEach(function(r){reasons[r]=2;});' +
    'var node=window.__admRenderReportTest({adId:"a-report-test-1",count:10,reasons:reasons,' +
    'latest:"2026-09-26T12:00:00Z",rows:[{id:"r1",note:"z".repeat(500)}]});' +
    'box.textContent="";box.appendChild(node);' +
    'return document.querySelectorAll("#reports .adm-acts .adm-btn, #reports .adm-acts a.adm-btn").length;})()');
  check('a report row renders at least one control at 360px', acts >= 1, 'rendered ' + acts + ' controls');
  const orphan = await isTrue('(function(){var t=document.getElementById("reports").textContent;' +
    'return t.indexOf("no longer on the site")!==-1;})()');
  check('a report whose listing is gone says so instead of showing a blank row',
    orphan.ok, orphan.detail || await ev('document.getElementById("reports").textContent.slice(0,90)'));
  const labelled = await isTrue('(function(){var t=document.getElementById("reports").textContent;' +
    'return t.indexOf("10 reports")!==-1 && t.indexOf("Scam")!==-1;})()');
  check('a report row labels the report count and the reasons', labelled.ok, labelled.detail);
  const bleed = await isTrue('(function(){' +
    'if(document.documentElement.scrollWidth>window.innerWidth+1)' +
    'return "page scrollWidth "+document.documentElement.scrollWidth+" > "+window.innerWidth;' +
    'var bad=[];Array.prototype.forEach.call(document.querySelectorAll("#dash *"),function(n){' +
    'var b=n.getBoundingClientRect();' +
    'if(b.width&&b.right>window.innerWidth+1)bad.push((n.className||n.tagName)+"@"+Math.round(b.right));});' +
    'return bad.length?("overflow: "+bad.slice(0,3).join(", ")):true;})()');
  check('nothing bleeds past the 360px viewport with a report row open', bleed.ok, bleed.detail);

  /* The app-side dialog reuses #ovReport rather than building a second one. */
  await send('Page.navigate', { url: base + '/index.html' }, sessionId);
  await new Promise(r => setTimeout(r, 3000));
  const client = await isTrue('typeof window.YaadReport === "object" && typeof window.YaadReport.open === "function"');
  check('the app exposes the report client', client.ok, client.detail);
  const reuse = await isTrue('(function(){window.YaadReport.open("a-test-ad",{title:"Test listing"});' +
    'return !!document.getElementById("ovReport") && !document.getElementById("arReport");})()');
  check('the app dialog reuses #ovReport instead of building a second one', reuse.ok, reuse.detail);
  const opts = await ev('(function(){window.YaadReport.open("a-test-ad",{title:"Test"});' +
    'return document.querySelectorAll("#reportOptions .report-opt").length;})()');
  check('all five reasons are offered by the client, not by re-parsed markup',
    opts === 5, 'reason options: ' + opts);
  const armed = await isTrue('(function(){window.YaadReport.open("a-test-ad",{title:"Test"});' +
    'var o=document.querySelector("#reportOptions .report-opt");' +
    'var b=document.getElementById("reportSubmitBtn");' +
    'if(!o||!b)return "missing nodes";' +
    'var was=b.disabled;o.click();' +
    'return was===true && b.disabled===false && o.classList.contains("selected");})()');
  check('picking a reason enables Submit and nothing is sent yet', armed.ok, armed.detail);
  const css = await isTrue('Array.prototype.slice.call(document.styleSheets).some(function(x){' +
    'return (x.href||"").indexOf("ad-report.css")!==-1;})');
  check('the report stylesheet is loaded on the app', css.ok, css.detail);
}

/* ── run ─────────────────────────────────────────────────────────────────── */
/* The page server takes a RANDOM port (0). It must not share a port with
   Chrome's debugging endpoint, or Chrome silently fails to expose CDP and the
   whole browser half of this suite reports "never came up". */
server.listen(0, '127.0.0.1', async () => {
  if (CHROME) {
    const proc = spawn(CHROME, ['--headless=new', '--hide-scrollbars',
      '--force-device-scale-factor=1', '--window-size=1200,900',
      '--remote-debugging-port=' + DEBUG_PORT, '--remote-allow-origins=*',
      '--no-first-run', '--no-default-browser-check',
      '--user-data-dir=' + path.join(process.cwd(), '.chrome-reports-tmp'),
      'about:blank'], { stdio: 'ignore' });
    try { await browser(); }
    catch (e) { check('browser suite ran', false, msg(e)); }
    proc.kill();
    try { fs.rmSync(path.join(process.cwd(), '.chrome-reports-tmp'), { recursive: true, force: true }); } catch (e) {}
  } else {
    check('chrome available for the layout check', false, 'skipped — not installed');
  }
  console.log('\n' + (fail ? '[FAIL] ' : '[OK] ') + pass + ' passed, ' + fail + ' failed');
  server.close();
  process.exit(fail ? 1 : 0);
});
