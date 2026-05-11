-- PostgREST / Supabase JS needs schema USAGE + table privileges on wc2026.
-- Without this, exposing wc2026 in API settings yields: permission denied for schema wc2026 (42501).
-- RLS on each table still controls which rows anon vs authenticated can see.

grant usage on schema wc2026 to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema wc2026 to anon, authenticated, service_role;

grant usage, select on all sequences in schema wc2026 to anon, authenticated, service_role;

-- Future tables created in this schema (same owner) get the same API access by default.
alter default privileges in schema wc2026
  grant select, insert, update, delete on tables to anon, authenticated, service_role;

alter default privileges in schema wc2026
  grant usage, select on sequences to anon, authenticated, service_role;
