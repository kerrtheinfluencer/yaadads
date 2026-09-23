/* ── Weekly referral reset (top-5 prize + counters).
   Usage:
     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node tools/reset-referral-week.js
     (optionally SUPABASE_KEY when service-role key isn't available — the
      reset RPC is granted to service_role only, as it mutates leaderboards)

   The p_week_start is the date of the week that just ended (defaults to
   today). Called by .github/workflows/referral-weekly-reset.yml on a cron. ── */
const { createClient } = require('@supabase/supabase-js');

(async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.');
    process.exit(1);
  }
  const client = createClient(url, key);
  const weekStart = process.argv[2] || new Date().toISOString().slice(0, 10);
  const { data, error } = await client.rpc('reset_weekly_referrals', { p_week_start: weekStart });
  if (error) {
    console.error('[weekly-reset] FAILED:', error.message);
    process.exit(1);
  }
  console.log('[weekly-reset] ok', JSON.stringify(data || {}));
})();