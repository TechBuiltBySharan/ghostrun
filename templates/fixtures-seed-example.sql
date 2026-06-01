-- Copy to .ghostrun/fixtures/sql/seed.sql
-- Requires: export GHOSTRUN_TEST_DATABASE_URL=postgres://ghostrun:ghostrun@localhost:5433/ghostrun_test
-- Run: ghostrun services seed

-- Example: ensure a test user exists for form-login flows
-- INSERT INTO users (email, name) VALUES ('qa+ghostrun@example.com', 'GhostRun QA')
-- ON CONFLICT (email) DO NOTHING;
