const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL || "https://cquwshpsfybvgqodbxsf.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY env var.");
  console.error("Use your existing Supabase service role key locally, but do not commit it.");
  process.exit(1);
}

// Create a Supabase client with the service role key
const supabase = createClient(supabaseUrl, supabaseKey);

async function enableRLSAndPolicies() {
  try {
    // Enable RLS on the 'ads' table
    let { data, error } = await supabase.rpc("enable_rls_on_table", { table_name: "ads" });
    if (error) throw error;
    console.log("RLS enabled on 'ads' table.");

    // Drop old permissive policies if they exist
    await supabase.rpc("drop_policy_if_exists", { policy_name: "Public read ads", table_name: "ads" });
    await supabase.rpc("drop_policy_if_exists", { policy_name: "Public insert ads", table_name: "ads" });
    await supabase.rpc("drop_policy_if_exists", { policy_name: "Public update ads", table_name: "ads" });
    await supabase.rpc("drop_policy_if_exists", { policy_name: "Public delete ads", table_name: "ads" });

    // Policy: Public can read all active ads
    await supabase.rpc("create_policy", {
      policy_name: "Anyone can view active ads",
      table_name: "ads",
      action: "SELECT",
      roles: ["anon", "authenticated"],
      definition: "status = 'active' or status is null",
    });
    console.log("Policy 'Anyone can view active ads' created.");

    // Policy: Authenticated users can insert ads (seller_id must match their auth uid)
    await supabase.rpc("create_policy", {
      policy_name: "Authenticated users can insert ads",
      table_name: "ads",
      action: "INSERT",
      roles: ["authenticated"],
      definition: "seller_id = auth.uid()::text",
      check: "seller_id = auth.uid()::text",
    });
    console.log("Policy 'Authenticated users can insert ads' created.");

    // Policy: Users can only update their own ads
    await supabase.rpc("create_policy", {
      policy_name: "Users can update own ads",
      table_name: "ads",
      action: "UPDATE",
      roles: ["authenticated"],
      definition: "seller_id = auth.uid()::text",
      check: "seller_id = auth.uid()::text",
    });
    console.log("Policy 'Users can update own ads' created.");

    // Policy: Users can only delete their own ads
    await supabase.rpc("create_policy", {
      policy_name: "Users can delete own ads",
      table_name: "ads",
      action: "DELETE",
      roles: ["authenticated"],
      definition: "seller_id = auth.uid()::text",
    });
    console.log("Policy 'Users can delete own ads' created.");

    // Remove legacy policies after migration
    await supabase.rpc("drop_policy_if_exists", { policy_name: "Anon can update ads (legacy)", table_name: "ads" });
    await supabase.rpc("drop_policy_if_exists", { policy_name: "Anon can delete ads (legacy)", table_name: "ads" });
    console.log("Legacy 'Anon' update/delete policies for ads dropped.");

  } catch (error) {
    console.error("Error enabling RLS and policies:", error.message);
  }
}

enableRLSAndPolicies();
