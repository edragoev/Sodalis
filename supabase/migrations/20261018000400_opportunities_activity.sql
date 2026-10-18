-- activity: a short verb phrase for the idea ("Bake apple pie", "Visit", "Bring extra tomatoes"), written by
-- the event planner. The push title is built from it: "Bake apple pie with Jane?" (src/lib/coordinator/validate.ts).
-- Null for ideas saved before this column; the push then falls back to "Visit with Jane?".

alter table opportunities add column if not exists activity text;
