-- Visibilità del Turnista: "own" = solo i propri turni con nome, "all" = anche i nomi degli altri.
-- L'impostazione generale può valere per tutti ('all' / 'own') oppure essere "per persona"
-- ('per_user'): in quel caso conta la visibilità di ciascun account.
alter table public.profiles add column if not exists turnista_view text not null default 'own';
alter table public.profiles drop constraint if exists profiles_turnista_view_check;
alter table public.profiles add constraint profiles_turnista_view_check check (turnista_view in ('own', 'all'));

alter table public.calendar_settings drop constraint if exists calendar_settings_turnista_names_check;
alter table public.calendar_settings add constraint calendar_settings_turnista_names_check
  check (turnista_names in ('all', 'own', 'per_user'));

-- Il calendario applica la modalità effettiva: generale, oppure quella dell'account se "per persona".
create or replace function public.turnista_calendar()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  me text;
  mode text;
  own_view text;
begin
  if (select private.my_role()) is distinct from 'turnista'::public.app_role then
    raise exception 'Calendario riservato ai Turnisti' using errcode = '42501';
  end if;
  select coalesce(p.person_id, (select d.person_id from public.people_details d where d.email = lower(p.email) limit 1)), p.turnista_view
    into me, own_view from public.profiles p where p.id = (select auth.uid());
  select coalesce((select c.turnista_names from public.calendar_settings c where c.id = 1), 'all') into mode;
  if mode = 'per_user' then mode := coalesce(own_view, 'own'); end if;
  return jsonb_build_object(
    'mode', mode,
    'me', (select jsonb_build_object('id', pe.id, 'name', pe.name, 'color', pe.color) from public.people pe where pe.id = me),
    'excluded', coalesce((select jsonb_agg(e.day order by e.day) from public.excluded_days e), '[]'::jsonb),
    'slots', coalesce((
      select jsonb_agg(
        jsonb_build_object('slot', a.slot_id, 'mine', coalesce(a.person_id = me, false))
          || case when mode = 'all' or a.person_id = me then jsonb_build_object('name', pe.name, 'color', pe.color) else '{}'::jsonb end
        order by a.slot_id)
      from public.assignments a join public.people pe on pe.id = a.person_id
    ), '[]'::jsonb)
  );
end $$;
revoke execute on function public.turnista_calendar() from public, anon;
grant execute on function public.turnista_calendar() to authenticated;
