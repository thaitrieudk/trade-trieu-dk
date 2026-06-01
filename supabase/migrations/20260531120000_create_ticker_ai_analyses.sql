create table if not exists public.ticker_ai_analyses (
  symbol text primary key check (symbol = upper(symbol) and symbol ~ '^[A-Z][A-Z0-9.]{0,15}$'),
  analysis jsonb not null,
  model text,
  analysis_source text not null default 'openai',
  generated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ticker_ai_analyses_generated_at_idx
  on public.ticker_ai_analyses (generated_at desc);

alter table public.ticker_ai_analyses enable row level security;

revoke all on public.ticker_ai_analyses from anon, authenticated;
grant select, insert, update on public.ticker_ai_analyses to service_role;

drop policy if exists ticker_ai_analyses_service_role_all on public.ticker_ai_analyses;

create policy ticker_ai_analyses_service_role_all
on public.ticker_ai_analyses
for all
to service_role
using (true)
with check (true);

create or replace function public.set_ticker_ai_analyses_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_ticker_ai_analyses_updated_at on public.ticker_ai_analyses;

create trigger set_ticker_ai_analyses_updated_at
before update on public.ticker_ai_analyses
for each row
execute function public.set_ticker_ai_analyses_updated_at();
