-- family_members.pronouns (specs/01-database/schema.md). Free text, set by the
-- member and never inferred; null means agents default to they/them.

alter table family_members add column pronouns text;

-- Anon only gets column-level SELECT on family_members (see 20261017000400); the dashboard
-- shows pronouns, and they are not sensitive.
grant select (pronouns) on family_members to anon;
