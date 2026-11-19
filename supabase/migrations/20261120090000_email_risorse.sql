-- Email (aziendale) della risorsa: serve a riconoscerne l'account e a creare quello da Turnista.
-- Sta nei dettagli della scheda, leggibili da chi vede l'anagrafica completa (non da Viewer e Turnisti).
alter table public.people_details add column if not exists email text;
alter table public.people_details drop constraint if exists people_details_email_format;
alter table public.people_details add constraint people_details_email_format
  check (email is null or (email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'));
create unique index if not exists people_details_email_key on public.people_details (email) where email is not null;

-- Il Turnista è riconosciuto anche dall'email: se l'account non è collegato esplicitamente a una
-- risorsa, vale la risorsa con la stessa email.
create or replace function public.turnista_calendar()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  me text;
  mode text;
begin
  if (select private.my_role()) is distinct from 'turnista'::public.app_role then
    raise exception 'Calendario riservato ai Turnisti' using errcode = '42501';
  end if;
  select coalesce(p.person_id, (select d.person_id from public.people_details d where d.email = lower(p.email) limit 1))
    into me from public.profiles p where p.id = (select auth.uid());
  select coalesce((select c.turnista_names from public.calendar_settings c where c.id = 1), 'all') into mode;
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
