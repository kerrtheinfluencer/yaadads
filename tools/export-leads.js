/* ── Referral EMAIL LIST export → CSV.
   Pulls every captured referral lead plus registered members and writes
   referral-email-list.csv so you can plug the list into your mail tool.

   Usage:
     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node tools/export-leads.js
     (or SUPABASE_KEY with the anon key — reads are allowed for anon)

   Columns: email, name, source(lead/member), ref_code, referred_by_code,
            yaad_points, total_referrals, created_at                    ── */
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

function csvCell(v) {
  const s = (v == null ? '' : String(v));
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCsv(rows) {
  return rows.map(r => r.map(csvCell).join(',')).join('\n');
}

(async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) { console.error('Set SUPABASE_URL and a service/anon key.'); process.exit(1); }
  const c = createClient(url, key);

  const { data: leads, error: leadsErr } = await c
    .from('referral_leads')
    .select('email,ref_code,referrer_id,claimed,created_at')
    .order('created_at', { ascending: true });
  if (leadsErr) { console.error('Could not read referral_leads:', leadsErr.message); process.exit(1); }

  const { data: members, error: memberErr } = await c
    .from('profiles')
    .select('name,email,referral_code,referred_by_code,yaad_points,total_referrals,joined')
    .order('joined', { ascending: true });
  if (memberErr) { console.error('Could not read profiles:', memberErr.message); process.exit(1); }

  const headers = ['email', 'name', 'source', 'ref_code', 'referred_by_code', 'yaad_points', 'total_referrals', 'created_at'];
  const leadRows = (leads || []).map(l => [l.email, '', 'lead', l.ref_code, '', '', '', l.created_at]);
  const memberRows = (members || []).map(m => [
    m.email || '', m.name || '', 'member', m.referral_code || '', m.referred_by_code || '',
    m.yaad_points || 0, m.total_referrals || 0, m.joined || '',
  ]);
  const out = [headers.join(','), toCsv(leadRows), toCsv(memberRows)].filter(Boolean).join('\n');
  fs.writeFileSync('referral-email-list.csv', out + '\n', 'utf8');
  console.log(`[export-leads] wrote referral-email-list.csv (${leadRows.length} leads + ${memberRows.length} members)`);
})();