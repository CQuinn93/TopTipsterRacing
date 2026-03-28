-- Add per-email reset-code send counters to reduce abuse spikes.
alter table public.password_reset_codes
  add column if not exists sent_day date,
  add column if not exists sent_today_count int not null default 0,
  add column if not exists sent_month text,
  add column if not exists sent_month_count int not null default 0;

comment on column public.password_reset_codes.sent_day is 'UTC date for daily reset-code send counter.';
comment on column public.password_reset_codes.sent_today_count is 'How many reset emails sent for this email on sent_day.';
comment on column public.password_reset_codes.sent_month is 'UTC month key (YYYY-MM) for monthly reset-code send counter.';
comment on column public.password_reset_codes.sent_month_count is 'How many reset emails sent for this email on sent_month.';
