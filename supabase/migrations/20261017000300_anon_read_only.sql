-- The anon key is read-only (the demo has no auth; every write uses the service role).
-- RLS alone already blocks anon writes, but UPDATE and DELETE were silently filtered to
-- zero rows. Revoking the privileges makes them fail with "permission denied" (42501).

revoke insert, update, delete, truncate on all tables in schema public from anon;

-- Tables created by later migrations get the same treatment.
alter default privileges in schema public revoke insert, update, delete, truncate on tables from anon;
