-- Interventi in reperibilità dichiarati dai turnisti e approvati dal director del team o dal super admin.
-- Orari in ora italiana (timestamp senza fuso). Nessun dato personale oltre a note e nomi di chi decide.
-- Scrittura solo tramite le funzioni qui sotto, che verificano chi, quando e su quale turno.

create table public.interventions (
  id uuid primary key default gen_random_uuid(),
  slot_id text not null check (slot_id ~ '^\d{4}-\d{2}-\d{2}\|[DN]$'),
  person_id text not null references public.people (id) on delete cascade,
  start_at timestamp not null,
  end_at timestamp not null,
  note text check (note is null or length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reject_reason text check (reject_reason is null or length(reject_reason) <= 500),
  resend_comment text check (resend_comment is null or length(resend_comment) <= 500),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_by_name text,
  decided_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at and end_at <= start_at + interval '16 hours')
);
create index interventions_slot_idx on public.interventions (slot_id);
create index interventions_person_idx on public.interventions (person_id, start_at);

-- "Nessun intervento" dichiarato per un turno (non serve approvazione)
create table public.shift_no_intervention (
  slot_id text primary key check (slot_id ~ '^\d{4}-\d{2}-\d{2}\|[DN]$'),
  person_id text not null references public.people (id) on delete cascade,
  declared_by uuid references public.profiles (id) on delete set null,
  declared_at timestamptz not null default now()
);

-- Risorsa collegata all'account corrente (collegamento esplicito o stessa email)
create or replace function private.my_person_id()
returns text language sql stable security definer set search_path = ''
as $$
  select coalesce(p.person_id, (select d.person_id from public.people_details d where d.email = lower(p.email) limit 1))
  from public.profiles p where p.id = (select auth.uid()) and p.must_change_password = false
$$;

create or replace function private.rome_now()
returns timestamp language sql stable set search_path = ''
as $$ select (now() at time zone 'Europe/Rome')::timestamp $$;

-- Inizio e fine del turno: Notte 18:00 → 09:00 del giorno dopo, Diurno 09:00 → 18:00
create or replace function private.shift_start(s text)
returns timestamp language sql immutable set search_path = ''
as $$ select left(s, 10)::date + case when right(s, 1) = 'N' then time '18:00' else time '09:00' end $$;
create or replace function private.shift_end(s text)
returns timestamp language sql immutable set search_path = ''
as $$ select case when right(s, 1) = 'N' then (left(s, 10)::date + 1) + time '09:00' else left(s, 10)::date + time '18:00' end $$;

create or replace function private.day_consuntivato(s text)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.day_status d where d.day::text = left(s, 10) and d.consuntivato_at is not null) $$;

-- Può decidere (approvare, rifiutare, riportare in attesa): super admin o director del team della persona
create or replace function private.can_decide_for(pid text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(private.my_role() = 'super_admin', false)
      or exists (select 1 from public.people pe where pe.id = pid and pe.team is not null and private.is_director_of(pe.team))
$$;

revoke execute on function private.my_person_id(), private.rome_now(), private.shift_start(text), private.shift_end(text), private.day_consuntivato(text), private.can_decide_for(text) from public, anon;
grant execute on function private.my_person_id(), private.rome_now(), private.shift_start(text), private.shift_end(text), private.day_consuntivato(text), private.can_decide_for(text) to authenticated;

-- Controlli comuni per inserire o modificare un intervento sul proprio turno
create or replace function private.check_intervention(p_slot text, p_start timestamp, p_end timestamp, p_except uuid)
returns text language plpgsql stable security definer set search_path = ''
as $$
declare me text := private.my_person_id();
begin
  if me is null then
    raise exception 'Il tuo account non è collegato a una scheda del piano' using errcode = '42501';
  end if;
  if not exists (select 1 from public.assignments a where a.slot_id = p_slot and a.person_id = me) then
    raise exception 'Puoi segnalare interventi solo sui tuoi turni' using errcode = '42501';
  end if;
  if private.day_consuntivato(p_slot) then
    raise exception 'Giorno consuntivato: non si possono più segnalare o modificare interventi' using errcode = '22023';
  end if;
  if p_start is null or p_end is null or p_end <= p_start then
    raise exception 'La fine deve essere successiva all''inizio' using errcode = '22023';
  end if;
  if p_end > p_start + interval '16 hours' then
    raise exception 'Un intervento non può durare più di 16 ore' using errcode = '22023';
  end if;
  if p_start < private.shift_start(p_slot) or p_start >= private.shift_end(p_slot) then
    raise exception 'L''intervento deve iniziare durante il turno (% → %)', to_char(private.shift_start(p_slot), 'DD/MM HH24:MI'), to_char(private.shift_end(p_slot), 'DD/MM HH24:MI') using errcode = '22023';
  end if;
  if p_end > private.rome_now() + interval '5 minutes' then
    raise exception 'Non si può segnalare un intervento non ancora concluso' using errcode = '22023';
  end if;
  if exists (select 1 from public.interventions i where i.person_id = me and i.status <> 'rejected'
             and i.id is distinct from p_except and i.start_at < p_end and i.end_at > p_start) then
    raise exception 'Si sovrappone a un altro intervento già segnalato' using errcode = '22023';
  end if;
  return me;
end $$;
revoke execute on function private.check_intervention(text, timestamp, timestamp, uuid) from public, anon;
grant execute on function private.check_intervention(text, timestamp, timestamp, uuid) to authenticated;

create or replace function public.add_intervention(p_slot text, p_start timestamp, p_end timestamp, p_note text default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare me text; new_id uuid;
begin
  me := private.check_intervention(p_slot, p_start, p_end, null);
  insert into public.interventions (slot_id, person_id, start_at, end_at, note, created_by)
  values (p_slot, me, p_start, p_end, nullif(btrim(left(p_note, 500)), ''), (select auth.uid()))
  returning id into new_id;
  delete from public.shift_no_intervention where slot_id = p_slot;
  return new_id;
end $$;

-- Modifica finché non è approvato; un intervento rifiutato si corregge e torna in approvazione con un commento.
create or replace function public.update_intervention(p_id uuid, p_start timestamp, p_end timestamp, p_note text default null, p_comment text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare i public.interventions;
begin
  select * into i from public.interventions where id = p_id for update;
  if not found or i.person_id is distinct from private.my_person_id() then
    raise exception 'Intervento non trovato' using errcode = '42501';
  end if;
  if i.status = 'approved' then
    raise exception 'Intervento già approvato: non si modifica più' using errcode = '22023';
  end if;
  perform private.check_intervention(i.slot_id, p_start, p_end, p_id);
  update public.interventions set
    start_at = p_start, end_at = p_end, note = nullif(btrim(left(p_note, 500)), ''),
    status = 'pending',
    resend_comment = case when i.status = 'rejected' then nullif(btrim(left(p_comment, 500)), '') else i.resend_comment end,
    updated_at = now()
  where id = p_id;
end $$;

create or replace function public.delete_intervention(p_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare i public.interventions;
begin
  select * into i from public.interventions where id = p_id for update;
  if not found or i.person_id is distinct from private.my_person_id() then
    raise exception 'Intervento non trovato' using errcode = '42501';
  end if;
  if i.status = 'approved' then
    raise exception 'Intervento già approvato: non si elimina più' using errcode = '22023';
  end if;
  if private.day_consuntivato(i.slot_id) then
    raise exception 'Giorno consuntivato: non si possono più modificare interventi' using errcode = '22023';
  end if;
  delete from public.interventions where id = p_id;
end $$;

-- "Nessun intervento" sul proprio turno, a turno finito e se non ci sono interventi segnalati
create or replace function public.declare_no_intervention(p_slot text)
returns void language plpgsql security definer set search_path = ''
as $$
declare me text := private.my_person_id();
begin
  if me is null or not exists (select 1 from public.assignments a where a.slot_id = p_slot and a.person_id = me) then
    raise exception 'Puoi dichiararlo solo sui tuoi turni' using errcode = '42501';
  end if;
  if private.day_consuntivato(p_slot) then
    raise exception 'Giorno consuntivato: non si può più modificare' using errcode = '22023';
  end if;
  if private.rome_now() < private.shift_end(p_slot) then
    raise exception 'Si dichiara a turno finito (%)', to_char(private.shift_end(p_slot), 'DD/MM HH24:MI') using errcode = '22023';
  end if;
  if exists (select 1 from public.interventions i where i.slot_id = p_slot and i.person_id = me and i.status <> 'rejected') then
    raise exception 'Sul turno ci sono interventi segnalati: eliminali prima' using errcode = '22023';
  end if;
  insert into public.shift_no_intervention (slot_id, person_id, declared_by) values (p_slot, me, (select auth.uid()))
  on conflict (slot_id) do nothing;
end $$;

create or replace function public.clear_no_intervention(p_slot text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if private.day_consuntivato(p_slot) then
    raise exception 'Giorno consuntivato: non si può più modificare' using errcode = '22023';
  end if;
  delete from public.shift_no_intervention where slot_id = p_slot and person_id = private.my_person_id();
end $$;

-- Approva, rifiuta (con motivo) o riporta in attesa. Anche a giorno consuntivato.
create or replace function public.decide_intervention(p_id uuid, p_status text, p_reason text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare i public.interventions;
begin
  if p_status not in ('approved', 'rejected', 'pending') then
    raise exception 'Decisione non valida' using errcode = '22023';
  end if;
  select * into i from public.interventions where id = p_id for update;
  if not found then
    raise exception 'Intervento non trovato' using errcode = '22023';
  end if;
  if not private.can_decide_for(i.person_id) then
    raise exception 'Solo il director del team o il super admin possono decidere su questo intervento' using errcode = '42501';
  end if;
  if i.person_id = private.my_person_id() and private.my_role() is distinct from 'super_admin' then
    raise exception 'Un tuo intervento lo approva il super admin' using errcode = '42501';
  end if;
  if p_status = 'rejected' and coalesce(btrim(p_reason), '') = '' then
    raise exception 'Indica il motivo del rifiuto' using errcode = '22023';
  end if;
  update public.interventions set
    status = p_status,
    reject_reason = case when p_status = 'rejected' then btrim(left(p_reason, 500)) else null end,
    decided_by = case when p_status = 'pending' then null else (select auth.uid()) end,
    decided_by_name = case when p_status = 'pending' then null else private.my_name() end,
    decided_at = case when p_status = 'pending' then null else now() end,
    updated_at = now()
  where id = p_id;
end $$;

-- I miei turni e interventi (per Turnisti e per chiunque sia collegato a una scheda del piano)
create or replace function public.my_shifts()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare me text := private.my_person_id();
begin
  if (select private.has_access()) is not true then
    raise exception 'Accesso non abilitato' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'me', (select jsonb_build_object('id', pe.id, 'name', pe.name, 'color', pe.color) from public.people pe where pe.id = me),
    'shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slot', a.slot_id,
        'no_intervention', exists (select 1 from public.shift_no_intervention n where n.slot_id = a.slot_id and n.person_id = me),
        'consuntivato', private.day_consuntivato(a.slot_id)
      ) order by a.slot_id)
      from public.assignments a where a.person_id = me
    ), '[]'::jsonb),
    'interventions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'slot', i.slot_id, 'start', to_char(i.start_at, 'YYYY-MM-DD"T"HH24:MI'), 'end', to_char(i.end_at, 'YYYY-MM-DD"T"HH24:MI'),
        'note', i.note, 'status', i.status, 'reject_reason', i.reject_reason, 'resend_comment', i.resend_comment,
        'decided_by_name', i.decided_by_name, 'decided_at', i.decided_at
      ) order by i.start_at)
      from public.interventions i where i.person_id = me
    ), '[]'::jsonb)
  );
end $$;

revoke execute on function public.add_intervention(text, timestamp, timestamp, text), public.update_intervention(uuid, timestamp, timestamp, text, text),
  public.delete_intervention(uuid), public.declare_no_intervention(text), public.clear_no_intervention(text),
  public.decide_intervention(uuid, text, text), public.my_shifts() from public, anon;
grant execute on function public.add_intervention(text, timestamp, timestamp, text), public.update_intervention(uuid, timestamp, timestamp, text, text),
  public.delete_intervention(uuid), public.declare_no_intervention(text), public.clear_no_intervention(text),
  public.decide_intervention(uuid, text, text), public.my_shifts() to authenticated;

-- Lettura: chi legge l'anagrafica completa vede tutti gli interventi (ore e fasce; gli importi li calcola
-- l'app solo per chi può vederli); ognuno vede i propri. Nessuna scrittura diretta.
alter table public.interventions enable row level security;
alter table public.shift_no_intervention enable row level security;
revoke all on public.interventions, public.shift_no_intervention from anon, authenticated;
grant select on public.interventions, public.shift_no_intervention to authenticated;
create policy "interventions: lettura" on public.interventions for select to authenticated
  using ((select private.can_read_full()) or person_id = (select private.my_person_id()));
create policy "shift_no_intervention: lettura" on public.shift_no_intervention for select to authenticated
  using ((select private.can_read_full()) or person_id = (select private.my_person_id()));

alter publication supabase_realtime add table public.interventions, public.shift_no_intervention;
