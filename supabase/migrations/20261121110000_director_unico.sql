-- Un solo capo per team: il Director del team, oppure il Super admin se è assegnato a quel team
-- (il Super admin può essere a capo di un team). Nessun dato personale.
create unique index profiles_one_head_per_team on public.profiles (team)
  where role in ('director', 'super_admin') and team is not null;

-- Capo del team: Director o Super admin con quel team
create or replace function private.is_director_of(t text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.must_change_password = false
      and p.role in ('director', 'super_admin') and p.team = t
  )
$$;
