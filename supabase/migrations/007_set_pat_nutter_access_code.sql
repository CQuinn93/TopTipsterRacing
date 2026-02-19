-- Set access code for Pat Nutter 2026 (run after 005 and 006).
-- Users enter this 6-character code to request to join; admin approves via dashboard (code 777777).

update public.competitions
set access_code = 'PN2026'
where name = 'Pat Nutter 2026'
  and access_code is null;
