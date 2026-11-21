-- Profili normalizzati (passo 2 di 2). Un profilo per account; il team indica solo l'appartenenza.
-- Super admin (unico) · Governance (modifica tutto, RAL di tutti) · Director (modifica il piano, RAL e
-- approvazioni del solo proprio team) · HR (lettura, RAL di tutti, consuntiva) · PM (approccio, calendario,
-- interventi con le ore, approva gli interventi di tutti i team, nessuna RAL) · Viewer · Turnista.

-- 1. Il director non si assegna più per team: è chi ha il profilo Director in quel team
drop trigger if exists profiles_release_director on public.profiles;
drop trigger if exists teams_director_check on public.teams;
drop function if exists private.release_team_director();
drop function if exists private.check_team_director();

-- 2. Account: Full edit → Governance (team Governance) o Director; Viewer esteso → HR (team HR) o PM;
--    Viewer del team PM → PM
update public.profiles set role = (case
    when role = 'editor' and team = 'governance' then 'governance'
    when role = 'editor' then 'director'
    when role = 'viewer_plus' and team = 'hr' then 'hr'
    when role = 'viewer_plus' then 'pm'
    else 'pm'
  end)::public.app_role
where role in ('editor', 'viewer_plus') or (role = 'viewer' and team = 'pm');

alter table public.profiles add constraint profiles_role_current check (role::text not in ('editor', 'viewer_plus'));
-- Un solo Super admin
create unique index profiles_one_super_admin on public.profiles ((true)) where role = 'super_admin';

-- 3. Regole per profilo
create or replace function private.can_edit()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(private.my_role() in ('super_admin', 'governance', 'director'), false) $$;

create or replace function private.can_read_full()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(private.my_role() in ('super_admin', 'governance', 'director', 'hr'), false) $$;

-- Approccio (parametri applicati) e interventi di tutti: anche il PM
create or replace function private.can_read_plan()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(private.my_role() in ('super_admin', 'governance', 'director', 'hr', 'pm'), false) $$;

create or replace function private.can_read_calendar()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(private.my_role() in ('super_admin', 'governance', 'director', 'hr', 'pm', 'viewer'), false) $$;

-- RAL, livelli e importi di tutti i team
create or replace function private.sees_all()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(private.my_role() in ('super_admin', 'governance', 'hr'), false) $$;

create or replace function private.can_see_salary(pid text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.sees_all()
      or (coalesce(private.my_role() = 'director', false) and private.my_team() is not null
          and private.my_team() = (select pe.team from public.people pe where pe.id = pid))
$$;

-- Director di un team: profilo Director e quel team (possono essere più di uno)
create or replace function private.is_director_of(t text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.must_change_password = false and p.role = 'director' and p.team = t
  )
$$;

create or replace function private.can_close_day(d date)
returns boolean language sql stable security definer set search_path = ''
as $$ select private.can_mark_day(d) or coalesce(private.my_role() = 'hr', false) $$;

-- Decide sugli interventi: super admin, PM (tutti i team), Director del team della persona
create or replace function private.can_decide_for(pid text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(private.my_role() in ('super_admin', 'pm'), false)
      or exists (select 1 from public.people pe where pe.id = pid and pe.team is not null and private.is_director_of(pe.team))
$$;

-- Il team di una risorsa lo cambia solo chi vede tutto (altrimenti si potrebbe spostare una persona nel
-- proprio team per leggerne la RAL)
create or replace function private.guard_people_team()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and new.team is distinct from old.team
     and not private.sees_all() then
    raise exception 'Solo Governance e Super admin possono cambiare il team di una risorsa' using errcode = '42501';
  end if;
  return new;
end $$;

drop function if exists private.my_team_sees_all();

revoke execute on function private.can_read_plan(), private.sees_all() from public, anon;
grant execute on function private.can_read_plan(), private.sees_all() to authenticated;

-- 4. Letture del PM: parametri (per l'Approccio) e interventi di tutti
drop policy "settings: lettura" on public.settings;
create policy "settings: lettura" on public.settings for select to authenticated using ((select private.can_read_plan()));
drop policy "interventions: lettura" on public.interventions;
create policy "interventions: lettura" on public.interventions for select to authenticated
  using ((select private.can_read_plan()) or person_id = (select private.my_person_id()));
drop policy "shift_no_intervention: lettura" on public.shift_no_intervention;
create policy "shift_no_intervention: lettura" on public.shift_no_intervention for select to authenticated
  using ((select private.can_read_plan()) or person_id = (select private.my_person_id()));

-- 5. I team non decidono più visibilità né director
alter table public.teams drop column if exists director_id, drop column if exists sees_all;
