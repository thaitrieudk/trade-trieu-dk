create table if not exists public.saved_tickers (
  symbol text primary key check (symbol = upper(symbol) and symbol ~ '^[A-Z][A-Z0-9.]{0,15}$'),
  ticker jsonb not null,
  in_focus boolean not null default false,
  saved_to_scanner boolean not null default true,
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_tickers_in_focus_idx
  on public.saved_tickers (in_focus, updated_at desc)
  where in_focus = true;

create index if not exists saved_tickers_saved_to_scanner_idx
  on public.saved_tickers (saved_to_scanner, updated_at desc)
  where saved_to_scanner = true;

alter table public.saved_tickers enable row level security;

revoke all on public.saved_tickers from anon, authenticated;
grant select, insert, update, delete on public.saved_tickers to service_role;

drop policy if exists saved_tickers_service_role_all on public.saved_tickers;

create policy saved_tickers_service_role_all
on public.saved_tickers
for all
to service_role
using (true)
with check (true);

create or replace function public.set_saved_tickers_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_saved_tickers_updated_at on public.saved_tickers;

create trigger set_saved_tickers_updated_at
before update on public.saved_tickers
for each row
execute function public.set_saved_tickers_updated_at();
