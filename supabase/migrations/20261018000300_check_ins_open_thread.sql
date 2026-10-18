-- open_thread: one thing for Soladis to follow up on in the next call ("ask how the hip appointment
-- went"), picked by the post-call summary (src/lib/call-summary). The next call reads the latest one
-- into the {{open_thread}} placeholder. Null when there is nothing to follow up on.

alter table check_ins add column if not exists open_thread text;
