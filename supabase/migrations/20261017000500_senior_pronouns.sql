-- Pronouns for the elder, asked when a family member sets them up (e.g. 'she/her').
-- Hope and the dashboard can use this to refer to them correctly. Null means not given.
alter table seniors add column if not exists pronouns text;
