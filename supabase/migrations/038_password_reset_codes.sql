-- Secure, in-app password reset codes (email + code flow)
create table if not exists public.password_reset_codes (
  email text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  last_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.password_reset_codes is 'One-time password reset codes (hashed), keyed by normalized email.';

create index if not exists idx_password_reset_codes_expires on public.password_reset_codes(expires_at);

alter table public.password_reset_codes enable row level security;

-- No direct client access; edge functions use service role.
