-- Vista completa per account abilitati. Livello, RAL e importi (people_private) arrivano solo a chi
-- è abilitato e ha attivato la vista; altrimenti non lasciano il database.
-- Abilitabili: lo Space admin sempre; Governance, Director e HR se abilitati dallo Space admin.

alter table public.profiles
  add column if not exists full_view_allowed boolean not null default false,
  add column if not exists full_view boolean not null default false;

create or replace function private.full_view_eligible(r public.app_role, allowed boolean)
returns boolean language sql immutable set search_path = ''
as $$ select r = 'super_admin' or (r in ('governance', 'director', 'hr') and coalesce(allowed, false)) $$;

create or replace function private.full_view()
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select p.full_view and private.full_view_eligible(p.role, p.full_view_allowed)
    from public.profiles p
    where p.id = (select auth.uid()) and p.must_change_password = false
  ), false)
$$;

-- Stessa regola di prima (tutti i team per Space admin, Governance e HR; il proprio team per il Director),
-- in più serve la vista completa attiva
create or replace function private.can_see_salary(pid text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.full_view() and (
    private.sees_all()
    or (coalesce(private.my_role() = 'director', false) and private.my_team() is not null
        and private.my_team() = (select pe.team from public.people pe where pe.id = pid))
  )
$$;

-- Chi non è più abilitabile (cambio di profilo o abilitazione tolta) perde abilitazione e vista
create or replace function private.full_view_consistency()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.role not in ('governance', 'director', 'hr') then new.full_view_allowed := false; end if;
  if not private.full_view_eligible(new.role, new.full_view_allowed) then new.full_view := false; end if;
  return new;
end $$;

drop trigger if exists profiles_full_view_consistency on public.profiles;
create trigger profiles_full_view_consistency
  before insert or update on public.profiles
  for each row execute function private.full_view_consistency();

-- Interruttore personale: solo per sé e solo se abilitati
create or replace function public.set_full_view(p_on boolean)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = (select auth.uid()) and must_change_password = false;
  if not found or not private.full_view_eligible(p.role, p.full_view_allowed) then
    raise exception 'Operazione non consentita' using errcode = '42501';
  end if;
  update public.profiles set full_view = coalesce(p_on, false) where id = p.id;
  return coalesce(p_on, false);
end $$;

revoke execute on function private.full_view_eligible(public.app_role, boolean), private.full_view(),
  private.full_view_consistency(), public.set_full_view(boolean) from public, anon;
grant execute on function private.full_view_eligible(public.app_role, boolean), private.full_view(),
  public.set_full_view(boolean) to authenticated;
