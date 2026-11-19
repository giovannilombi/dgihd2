-- Turnista: l'account è collegato alla propria risorsa e legge il calendario solo tramite la funzione
-- turnista_calendar(), che restituisce i nomi degli altri oppure "turno coperto" secondo l'impostazione
-- scelta dal super admin. Le tabelle di persone, turni e giorni non sono leggibili direttamente.

-- 1) Collegamento account → risorsa (al massimo un account per risorsa)
alter table public.profiles add column if not exists person_id text references public.people(id) on delete set null;
create unique index if not exists profiles_person_id_key on public.profiles(person_id) where person_id is not null;
alter table public.admin_requests add column if not exists person_id text;

-- 2) Nomi visibili ai Turnisti: 'all' = tutti i nomi, 'own' = solo i propri turni (gli altri "turno coperto")
create table if not exists public.calendar_settings (
  id int primary key default 1 check (id = 1),
  turnista_names text not null default 'all' check (turnista_names in ('all', 'own')),
  updated_at timestamptz not null default now()
);
insert into public.calendar_settings (id) values (1) on conflict (id) do nothing;
alter table public.calendar_settings enable row level security;
revoke all on public.calendar_settings from anon;
create policy "calendar_settings: lettura super admin" on public.calendar_settings
  for select to authenticated using ((select private.my_role()) = 'super_admin');
create policy "calendar_settings: modifica super admin" on public.calendar_settings
  for update to authenticated using ((select private.my_role()) = 'super_admin') with check ((select private.my_role()) = 'super_admin');

-- 3) Lettura diretta di persone, turni e giorni non richiesti: tutti i livelli tranne il Turnista
create or replace function private.can_read_calendar()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(private.my_role() in ('super_admin', 'editor', 'viewer_plus', 'viewer'), false) $$;

alter policy "people: lettura" on public.people using ((select private.can_read_calendar()));
alter policy "assignments: lettura" on public.assignments using ((select private.can_read_calendar()));
alter policy "excluded_days: lettura" on public.excluded_days using ((select private.can_read_calendar()));

-- 4) Calendario del Turnista: giorni non richiesti, turni coperti, i propri turni e (se consentito) i nomi
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
  select p.person_id into me from public.profiles p where p.id = (select auth.uid());
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
