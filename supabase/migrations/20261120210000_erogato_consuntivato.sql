-- Giorni erogati e consuntivati. Nessun dato personale oltre al nome di chi esegue l'azione.
-- - Erogato: il giorno è definitivo, turni e persone non si cambiano più (controllo nel database).
--   Lo segnano Full edit, super admin e il director di un team con un turno quel giorno, dal giorno dopo
--   (dal 20261120220000: dalla fine del turno).
-- - Consuntivato: chiude l'inserimento degli interventi del giorno (fase interventi). Lo fa chi può segnare
--   l'erogato e chi legge tutto in un team che "vede tutto" (es. HR); anche per un mese intero.
-- - Sblocca: un passo indietro (consuntivato → erogato → aperto), solo super admin o director; resta traccia.

create table public.day_status (
  day date primary key,
  erogato_at timestamptz not null default now(),
  erogato_by uuid references public.profiles (id) on delete set null,
  erogato_by_name text not null default '',
  consuntivato_at timestamptz,
  consuntivato_by uuid references public.profiles (id) on delete set null,
  consuntivato_by_name text
);

create table public.day_status_log (
  id bigint generated always as identity primary key,
  day date not null,
  action text not null check (action in ('erogato', 'consuntivato', 'sblocco_erogato', 'sblocco_consuntivato')),
  by_id uuid references public.profiles (id) on delete set null,
  by_name text not null default '',
  note text check (note is null or length(note) <= 300),
  at timestamptz not null default now()
);
create index day_status_log_day_idx on public.day_status_log (day);

-- Oggi in Italia (un giorno si segna erogato dal giorno dopo)
create or replace function private.rome_today()
returns date language sql stable set search_path = ''
as $$ select (now() at time zone 'Europe/Rome')::date $$;

-- Nome di chi esegue l'azione, per la traccia
create or replace function private.my_name()
returns text language sql stable security definer set search_path = ''
as $$ select coalesce(nullif(btrim(p.display_name), ''), p.email, '') from public.profiles p where p.id = (select auth.uid()) $$;

-- L'utente è director di un team con un turno assegnato quel giorno?
create or replace function private.directs_day(d date)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.assignments a join public.people pe on pe.id = a.person_id
    where left(a.slot_id, 10) = d::text and pe.team is not null and private.is_director_of(pe.team)
  )
$$;

create or replace function private.can_mark_day(d date)
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(private.can_edit(), false) or private.directs_day(d) $$;

create or replace function private.can_close_day(d date)
returns boolean language sql stable security definer set search_path = ''
as $$ select private.can_mark_day(d) or (coalesce(private.can_read_full(), false) and private.my_team_sees_all()) $$;

create or replace function private.can_unlock_day(d date)
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(private.my_role() = 'super_admin', false) or private.directs_day(d) $$;

revoke execute on function private.rome_today(), private.my_name(), private.directs_day(date), private.can_mark_day(date), private.can_close_day(date), private.can_unlock_day(date) from public, anon;
grant execute on function private.rome_today(), private.my_name(), private.directs_day(date), private.can_mark_day(date), private.can_close_day(date), private.can_unlock_day(date) to authenticated;

-- Azioni (le uniche vie di scrittura: nessuna policy di scrittura diretta sulle tabelle)
create or replace function public.mark_day_erogato(p_day date)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not private.can_mark_day(p_day) then
    raise exception 'Non puoi segnare come erogato questo giorno' using errcode = '42501';
  end if;
  if p_day >= private.rome_today() then
    raise exception 'Un giorno si può segnare come erogato solo dal giorno dopo' using errcode = '22023';
  end if;
  if not exists (select 1 from public.assignments a where left(a.slot_id, 10) = p_day::text) then
    raise exception 'Nessun turno assegnato in questo giorno' using errcode = '22023';
  end if;
  insert into public.day_status (day, erogato_by, erogato_by_name)
  values (p_day, (select auth.uid()), private.my_name())
  on conflict (day) do nothing;
  if not found then
    raise exception 'Il giorno è già erogato' using errcode = '22023';
  end if;
  insert into public.day_status_log (day, action, by_id, by_name) values (p_day, 'erogato', (select auth.uid()), private.my_name());
end $$;

create or replace function public.consuntiva_day(p_day date)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not private.can_close_day(p_day) then
    raise exception 'Non puoi consuntivare questo giorno' using errcode = '42501';
  end if;
  update public.day_status
     set consuntivato_at = now(), consuntivato_by = (select auth.uid()), consuntivato_by_name = private.my_name()
   where day = p_day and consuntivato_at is null;
  if not found then
    raise exception 'Si consuntiva solo un giorno erogato e non ancora consuntivato' using errcode = '22023';
  end if;
  insert into public.day_status_log (day, action, by_id, by_name) values (p_day, 'consuntivato', (select auth.uid()), private.my_name());
end $$;

-- Consuntiva tutti i giorni erogati del mese (YYYY-MM) su cui l'utente ha il permesso; restituisce quanti.
create or replace function public.consuntiva_month(p_month text)
returns integer language plpgsql security definer set search_path = ''
as $$
declare d date; n integer := 0;
begin
  if p_month !~ '^\d{4}-\d{2}$' then
    raise exception 'Mese non valido' using errcode = '22023';
  end if;
  for d in select s.day from public.day_status s where to_char(s.day, 'YYYY-MM') = p_month and s.consuntivato_at is null order by s.day loop
    if private.can_close_day(d) then
      update public.day_status
         set consuntivato_at = now(), consuntivato_by = (select auth.uid()), consuntivato_by_name = private.my_name()
       where day = d;
      insert into public.day_status_log (day, action, by_id, by_name) values (d, 'consuntivato', (select auth.uid()), private.my_name());
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- Un passo indietro: consuntivato → erogato, erogato → aperto. Restituisce lo stato tolto.
create or replace function public.unlock_day(p_day date, p_note text default null)
returns text language plpgsql security definer set search_path = ''
as $$
declare s public.day_status;
begin
  if not private.can_unlock_day(p_day) then
    raise exception 'Solo il director del team o il super admin possono sbloccare questo giorno' using errcode = '42501';
  end if;
  select * into s from public.day_status where day = p_day for update;
  if not found then
    raise exception 'Il giorno non è erogato' using errcode = '22023';
  end if;
  if s.consuntivato_at is not null then
    update public.day_status set consuntivato_at = null, consuntivato_by = null, consuntivato_by_name = null where day = p_day;
    insert into public.day_status_log (day, action, by_id, by_name, note) values (p_day, 'sblocco_consuntivato', (select auth.uid()), private.my_name(), nullif(btrim(left(p_note, 300)), ''));
    return 'consuntivato';
  end if;
  delete from public.day_status where day = p_day;
  insert into public.day_status_log (day, action, by_id, by_name, note) values (p_day, 'sblocco_erogato', (select auth.uid()), private.my_name(), nullif(btrim(left(p_note, 300)), ''));
  return 'erogato';
end $$;

revoke execute on function public.mark_day_erogato(date), public.consuntiva_day(date), public.consuntiva_month(text), public.unlock_day(date, text) from public, anon;
grant execute on function public.mark_day_erogato(date), public.consuntiva_day(date), public.consuntiva_month(text), public.unlock_day(date, text) to authenticated;

-- Giorni erogati: turni e giorni non richiesti non si modificano più
create or replace function private.guard_erogato_assignments()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if (tg_op in ('UPDATE', 'DELETE') and exists (select 1 from public.day_status s where s.day::text = left(old.slot_id, 10)))
     or (tg_op in ('INSERT', 'UPDATE') and exists (select 1 from public.day_status s where s.day::text = left(new.slot_id, 10))) then
    raise exception 'Giorno erogato: i turni non si modificano più (prima va sbloccato)' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
revoke execute on function private.guard_erogato_assignments() from public, anon, authenticated;
create trigger assignments_erogato_guard
  before insert or update or delete on public.assignments
  for each row execute function private.guard_erogato_assignments();

create or replace function private.guard_erogato_excluded()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.day_status s where s.day::text = new.day::text) then
    raise exception 'Giorno erogato: non si può segnare come non richiesto' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function private.guard_erogato_excluded() from public, anon, authenticated;
create trigger excluded_days_erogato_guard
  before insert or update on public.excluded_days
  for each row execute function private.guard_erogato_excluded();

-- Lettura: stato dei giorni per chi vede il calendario, traccia per chi legge tutto
alter table public.day_status enable row level security;
alter table public.day_status_log enable row level security;
revoke all on public.day_status, public.day_status_log from anon, authenticated;
grant select on public.day_status, public.day_status_log to authenticated;
create policy "day_status: lettura" on public.day_status for select to authenticated using ((select private.can_read_calendar()));
create policy "day_status_log: lettura" on public.day_status_log for select to authenticated using ((select private.can_read_full()));

alter publication supabase_realtime add table public.day_status;
