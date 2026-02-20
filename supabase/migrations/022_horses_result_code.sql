-- Add result_code to horses for non-numeric finishes: f (fall), u (unseated), pu (pulled up), ur, etc.
-- When result_code is set, position is null (horse did not finish in a numeric place).

alter table public.horses
  add column if not exists result_code text;

-- Optional: add a check constraint to limit valid codes (comment out if API returns other codes)
-- alter table public.horses add constraint horses_result_code_check
--   check (result_code is null or result_code in ('f','u','pu','ur','bd','ro','co','su','ref'));
