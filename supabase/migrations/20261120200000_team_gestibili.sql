-- Team gestiti dal super admin: crea, rinomina, elimina (se non usati), director e "vede tutto".
-- Sostituisce le liste fisse di team nei vincoli e nelle regole di visibilità. Nessun dato personale.

create table public.teams (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,31}$'),
  label text not null check (length(btrim(label)) between 1 and 40),
  sees_all boolean not null default false,
  director_id uuid references public.profiles (id) on delete set null,
  sort integer not null default 100,
  created_at timestamptz not null default now()
);
create unique index teams_label_key on public.teams (lower(btrim(label)));

insert into public.teams (id, label, sees_all, sort) values
  ('tech', 'Tech', false, 10),
  ('design', 'Design', false, 20),
  ('pm', 'PM', false, 30),
  ('director', 'Director', false, 40),
  ('hr', 'HR', true, 50),
  ('governance', 'Governance', true, 60);

-- I team di risorse, account e richieste devono esistere; un team in uso non si può eliminare.
alter table public.people drop constraint people_team_check;
alter table public.people add constraint people_team_fkey foreign key (team) references public.teams (id) on update cascade on delete restrict;
alter table public.profiles drop constraint profiles_team_check;
alter table public.profiles add constraint profiles_team_fkey foreign key (team) references public.teams (id) on update cascade on delete restrict;
alter table public.admin_requests drop constraint admin_requests_team_check;
alter table public.admin_requests add constraint admin_requests_team_fkey foreign key (team) references public.teams (id) on update cascade on delete set null;

-- Il team dell'utente corrente vede RAL e importi di tutti i team?
create or replace function private.my_team_sees_all()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce((select t.sees_all from public.teams t where t.id = private.my_team()), false) $$;

-- L'utente corrente è il director (valido) del team?
create or replace function private.is_director_of(t text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.teams tm join public.profiles p on p.id = tm.director_id
    where tm.id = t and p.id = (select auth.uid()) and p.must_change_password = false
      and p.team = tm.id and p.role in ('super_admin', 'editor', 'viewer_plus')
  )
$$;

revoke execute on function private.my_team_sees_all(), private.is_director_of(text) from public, anon;
grant execute on function private.my_team_sees_all(), private.is_director_of(text) to authenticated;

create or replace function private.can_see_salary(pid text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.can_read_full() and (
    private.my_team_sees_all()
    or private.my_team() = (select pe.team from public.people pe where pe.id = pid)
  )
$$;

create or replace function private.guard_people_team()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and new.team is distinct from old.team
     and not private.my_team_sees_all() then
    raise exception 'Solo chi vede tutti i team (es. HR e Governance) può cambiare il team di una risorsa' using errcode = '42501';
  end if;
  return new;
end $$;

-- Director: un account del team con accesso completo in lettura (Viewer esteso, Full edit, Super admin).
create or replace function private.check_team_director()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.director_id is not null and not exists (
    select 1 from public.profiles p
    where p.id = new.director_id and p.team = new.id and p.role in ('super_admin', 'editor', 'viewer_plus')
  ) then
    raise exception 'Il director deve essere un account del team con livello Viewer esteso, Full edit o Super admin' using errcode = '23514';
  end if;
  new.label := btrim(new.label);
  return new;
end $$;
revoke execute on function private.check_team_director() from public, anon, authenticated;
create trigger teams_director_check
  before insert or update on public.teams
  for each row execute function private.check_team_director();

-- Se il director cambia team o livello, il team resta senza director (approva il super admin).
create or replace function private.release_team_director()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.teams set director_id = null
   where director_id = new.id
     and (new.team is distinct from id or new.role not in ('super_admin', 'editor', 'viewer_plus'));
  return new;
end $$;
revoke execute on function private.release_team_director() from public, anon, authenticated;
create trigger profiles_release_director
  after update of team, role on public.profiles
  for each row execute function private.release_team_director();

-- Lettura per chi ha accesso (etichette e regole); modifiche solo al super admin.
alter table public.teams enable row level security;
revoke all on public.teams from anon;
grant select, insert, update, delete on public.teams to authenticated;
create policy "teams: lettura" on public.teams for select to authenticated using ((select private.has_access()));
create policy "teams: inserimento super admin" on public.teams for insert to authenticated with check ((select private.my_role()) = 'super_admin');
create policy "teams: modifica super admin" on public.teams for update to authenticated using ((select private.my_role()) = 'super_admin') with check ((select private.my_role()) = 'super_admin');
create policy "teams: eliminazione super admin" on public.teams for delete to authenticated using ((select private.my_role()) = 'super_admin');

alter publication supabase_realtime add table public.teams;
