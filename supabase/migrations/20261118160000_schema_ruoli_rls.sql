-- Piano reperibilità ARM: schema, ruoli e Row Level Security.
-- Nessun dato personale in questo file: solo struttura e regole di accesso.

create type public.app_role as enum ('super_admin', 'editor', 'viewer_plus', 'viewer');

-- Profilo applicativo di ogni account (creato/modificato solo dalla funzione admin-users con service role)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null default '',
  role public.app_role not null default 'viewer',
  must_change_password boolean not null default true,
  created_at timestamptz not null default now()
);

-- Ruolo effettivo dell'utente corrente: NULL se non ha profilo o deve ancora cambiare la password
-- temporanea (in quel caso il database non restituisce alcun dato).
create or replace function public.my_role()
returns public.app_role
language sql stable security definer set search_path = ''
as $$
  select p.role from public.profiles p
  where p.id = (select auth.uid()) and p.must_change_password = false
$$;

create or replace function public.can_read_full()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(public.my_role() in ('super_admin', 'editor', 'viewer_plus'), false) $$;

create or replace function public.can_edit()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(public.my_role() in ('super_admin', 'editor'), false) $$;

create or replace function public.has_access()
returns boolean language sql stable security definer set search_path = ''
as $$ select public.my_role() is not null $$;

revoke execute on function public.my_role(), public.can_read_full(), public.can_edit(), public.has_access() from public, anon;
grant execute on function public.my_role(), public.can_read_full(), public.can_edit(), public.has_access() to authenticated;

-- Persone: dati minimi visibili a tutti i ruoli (servono al calendario)
create table public.people (
  id text primary key check (char_length(id) between 1 and 40),
  name text not null check (char_length(name) between 1 and 80),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  active boolean not null default true,
  sort integer not null default 0,
  updated_at timestamptz not null default now()
);

-- Dettagli riservati: livello, RAL, disponibilità, ferie (viewer esteso, full edit, super admin)
create table public.people_details (
  person_id text primary key references public.people (id) on delete cascade,
  level text not null check (level in ('D1','D2','C1','C2','C3','B1','B2','B3','A1')),
  ral numeric(10, 2) not null default 0 check (ral >= 0 and ral <= 1000000),
  availability text not null default 'nessuna' check (availability in ('volontario', 'limitato', 'nessuna')),
  max_per_month integer check (max_per_month between 1 and 3),
  unavailable date[] not null default '{}',
  preferred_days date[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table public.assignments (
  slot_id text primary key check (slot_id ~ '^\d{4}-\d{2}-\d{2}\|[DN]$'),
  person_id text not null references public.people (id) on delete cascade,
  pinned boolean not null default false,
  updated_at timestamptz not null default now()
);
create index assignments_person_idx on public.assignments (person_id);

create table public.excluded_days (
  day date primary key
);

-- Parametri economici (riga unica)
create table public.settings (
  id integer primary key default 1 check (id = 1),
  params jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.settings (id, params) values (1, '{}'::jsonb);

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.people enable row level security;
alter table public.people_details enable row level security;
alter table public.assignments enable row level security;
alter table public.excluded_days enable row level security;
alter table public.settings enable row level security;

revoke all on public.profiles, public.people, public.people_details, public.assignments, public.excluded_days, public.settings from anon;

create policy "profilo: lettura del proprio o super admin" on public.profiles
  for select to authenticated using (id = (select auth.uid()) or (select public.my_role()) = 'super_admin');

create policy "people: lettura" on public.people for select to authenticated using ((select public.has_access()));
create policy "people: inserimento" on public.people for insert to authenticated with check ((select public.can_edit()));
create policy "people: modifica" on public.people for update to authenticated using ((select public.can_edit())) with check ((select public.can_edit()));
create policy "people: eliminazione" on public.people for delete to authenticated using ((select public.can_edit()));

create policy "people_details: lettura" on public.people_details for select to authenticated using ((select public.can_read_full()));
create policy "people_details: inserimento" on public.people_details for insert to authenticated with check ((select public.can_edit()));
create policy "people_details: modifica" on public.people_details for update to authenticated using ((select public.can_edit())) with check ((select public.can_edit()));
create policy "people_details: eliminazione" on public.people_details for delete to authenticated using ((select public.can_edit()));

create policy "assignments: lettura" on public.assignments for select to authenticated using ((select public.has_access()));
create policy "assignments: inserimento" on public.assignments for insert to authenticated with check ((select public.can_edit()));
create policy "assignments: modifica" on public.assignments for update to authenticated using ((select public.can_edit())) with check ((select public.can_edit()));
create policy "assignments: eliminazione" on public.assignments for delete to authenticated using ((select public.can_edit()));

create policy "excluded_days: lettura" on public.excluded_days for select to authenticated using ((select public.has_access()));
create policy "excluded_days: inserimento" on public.excluded_days for insert to authenticated with check ((select public.can_edit()));
create policy "excluded_days: eliminazione" on public.excluded_days for delete to authenticated using ((select public.can_edit()));

create policy "settings: lettura" on public.settings for select to authenticated using ((select public.can_read_full()));
create policy "settings: modifica" on public.settings for update to authenticated using ((select public.can_edit())) with check ((select public.can_edit()));

-- Aggiornamenti in tempo reale tra utenti (rispettano le stesse regole RLS)
alter publication supabase_realtime add table public.people, public.people_details, public.assignments, public.excluded_days, public.settings;

-- Keep-alive per servizi di monitoraggio (es. UptimeRobot): esegue una query sul database
-- senza esporre alcun dato. Richiamabile anche senza login.
create or replace function public.ping()
returns text language sql stable security definer set search_path = ''
as $$ select 'ok ' || to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS') $$;
revoke execute on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;
