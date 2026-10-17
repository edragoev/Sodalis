-- What a family member tells us about the elder when setting up their profile, so Hope and the
-- coordinator know them (specs/01-database/schema.md: seniors.notes already holds free text
-- "things to know"). birthday is a plain date; interests and skills are short lowercase tags.
alter table seniors
  add column if not exists birthday  date,
  add column if not exists interests text[] not null default '{}',
  add column if not exists skills    text[] not null default '{}';
