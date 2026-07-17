-- Function to enable RLS on a table
CREATE OR REPLACE FUNCTION enable_rls_on_table(table_name text) RETURNS void AS $$
BEGIN
  EXECUTE format("ALTER TABLE %I ENABLE ROW LEVEL SECURITY;", table_name);
END;
$$ LANGUAGE plpgsql;

-- Function to drop a policy if it exists
CREATE OR REPLACE FUNCTION drop_policy_if_exists(policy_name text, table_name text) RETURNS void AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = policy_name AND tablename = table_name) THEN
    EXECUTE format("DROP POLICY %I ON %I;", policy_name, table_name);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to create a policy
CREATE OR REPLACE FUNCTION create_policy(
  policy_name text,
  table_name text,
  action text,
  roles text[],
  definition text,
  check_expression text DEFAULT NULL
) RETURNS void AS $$
BEGIN
  IF check_expression IS NOT NULL AND action = 'INSERT' THEN
    EXECUTE format("CREATE POLICY %I ON %I FOR %s TO %s WITH CHECK (%s);", policy_name, table_name, action, array_to_string(roles, ","), check_expression);
  ELSIF check_expression IS NOT NULL AND action = 'UPDATE' THEN
    EXECUTE format("CREATE POLICY %I ON %I FOR %s TO %s USING (%s) WITH CHECK (%s);", policy_name, table_name, action, array_to_string(roles, ","), definition, check_expression);
  ELSIF check_expression IS NULL AND action = 'SELECT' THEN
    EXECUTE format("CREATE POLICY %I ON %I FOR %s TO %s USING (%s);", policy_name, table_name, action, array_to_string(roles, ","), definition);
  ELSIF check_expression IS NULL AND action = 'DELETE' THEN
    EXECUTE format("CREATE POLICY %I ON %I FOR %s TO %s USING (%s);", policy_name, table_name, action, array_to_string(roles, ","), definition);
  ELSE
    -- For other actions or if check_expression is not applicable, you might need to adjust this.
    RAISE EXCEPTION 'Unsupported action or combination for policy creation: %s', action;
  END IF;
END;
$$ LANGUAGE plpgsql;