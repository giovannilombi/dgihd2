-- Storico (lettura: Space admin e Governance; ripristino dei turni: solo Space admin)
-- 1. Turni: ogni modifica a turni, puntine e giorni non richiesti, raggruppata in sessioni per persona
--    (nuova sessione dopo 30 minuti senza modifiche); all'inizio di ogni sessione una fotografia del piano.
-- 2. Dati: parametri, anagrafica, team, account e impostazioni (prima → dopo).
-- 3. Attività sugli interventi (inseriti, modificati, decisi, "Nessun intervento"); le conferme dei
--    giorni sono già in day_status_log.

create or replace function private.can_read_history()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(private.my_role() in ('super_admin', 'governance'), false) $$;

-- Chi agisce: l'utente collegato; per la funzione admin-users (chiave di servizio) l'account dello
-- Space admin che l'ha chiamata, passato nell'intestazione x-actor-id (accettata solo con la chiave di servizio).
create or replace function private.actor_id()
returns uuid language plpgsql stable security definer set search_path = ''
as $$
declare uid uuid := (select auth.uid()); h text;
begin
  if uid is not null then return uid; end if;
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' then return null; end if;
  h := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-actor-id';
  if h ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return h::uuid; end if;
  return null;
end $$;

create or replace function private.actor_name()
returns text language sql stable security definer set search_path = ''
as $$
  select coalesce((select coalesce(nullif(btrim(p.display_name), ''), p.email) from public.profiles p where p.id = private.actor_id()), 'Sistema')
$$;

-- ---------- 1. Turni ----------

create table public.plan_sessions (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  user_name text not null,
  started_at timestamptz not null default clock_timestamp(),
  last_at timestamptz not null default clock_timestamp(),
  -- piano subito prima della prima modifica: {"a": {slot: {"p": persona, "pin": bool}}, "x": [giorni non richiesti]}
  snapshot jsonb not null,
  -- sessione chiusa (ripristino): le modifiche successive aprono una nuova sessione
  closed boolean not null default false,
  restore_of bigint references public.plan_sessions(id) on delete set null,
  changes integer not null default 0
);
create index plan_sessions_user_last on public.plan_sessions (user_id, last_at desc);

create table public.plan_changes (
  id bigint generated always as identity primary key,
  session_id bigint not null references public.plan_sessions(id) on delete cascade,
  at timestamptz not null default clock_timestamp(),
  kind text not null check (kind in ('assign', 'unassign', 'replace', 'pin', 'unpin', 'exclude', 'include')),
  slot_id text,
  day date not null,
  old_person text, new_person text,
  -- nomi al momento della modifica (la persona può essere eliminata in seguito)
  old_name text, new_name text
);
create index plan_changes_session on public.plan_changes (session_id);
create index plan_changes_day on public.plan_changes (day);

create or replace function private.plan_snapshot()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'a', coalesce((select jsonb_object_agg(a.slot_id, jsonb_build_object('p', a.person_id, 'pin', a.pinned)) from public.assignments a), '{}'::jsonb),
    'x', coalesce((select jsonb_agg(e.day::text order by e.day) from public.excluded_days e), '[]'::jsonb))
$$;

-- Sessione corrente di chi agisce (una per transazione): continua quella aperta da meno di 30 minuti,
-- altrimenti ne apre una nuova con la fotografia del piano prima della modifica.
create or replace function private.plan_session()
returns bigint language plpgsql security definer set search_path = ''
as $$
declare sid bigint := nullif(current_setting('app.plan_session', true), '')::bigint; uid uuid := private.actor_id();
begin
  if sid is not null then return sid; end if;
  select s.id into sid from public.plan_sessions s
   where s.user_id is not distinct from uid and not s.closed and s.last_at > clock_timestamp() - interval '30 minutes'
   order by s.last_at desc limit 1;
  if sid is null then
    insert into public.plan_sessions (user_id, user_name, snapshot) values (uid, private.actor_name(), private.plan_snapshot()) returning id into sid;
  end if;
  perform set_config('app.plan_session', sid::text, true);
  return sid;
end $$;

-- Prima di ogni istruzione che tocca il piano: la fotografia va presa prima di qualunque riga modificata
create or replace function private.plan_before_statement()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin perform private.plan_session(); return null; end $$;

create or replace function private.plan_log_assignment()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare sid bigint := private.plan_session(); o_p text; n_p text; o_pin boolean := false; n_pin boolean := false; s text; n int := 0;
begin
  if tg_op <> 'INSERT' then o_p := old.person_id; o_pin := coalesce(old.pinned, false); s := old.slot_id; end if;
  if tg_op <> 'DELETE' then n_p := new.person_id; n_pin := coalesce(new.pinned, false); s := new.slot_id; end if;
  if o_p is distinct from n_p then
    insert into public.plan_changes (session_id, kind, slot_id, day, old_person, new_person, old_name, new_name)
    values (sid, case when o_p is null then 'assign' when n_p is null then 'unassign' else 'replace' end, s, left(s, 10)::date, o_p, n_p,
            (select pe.name from public.people pe where pe.id = o_p), (select pe.name from public.people pe where pe.id = n_p));
    n := n + 1;
  end if;
  if tg_op <> 'DELETE' and o_pin <> n_pin then
    insert into public.plan_changes (session_id, kind, slot_id, day, new_person, new_name)
    values (sid, case when n_pin then 'pin' else 'unpin' end, s, left(s, 10)::date, n_p, (select pe.name from public.people pe where pe.id = n_p));
    n := n + 1;
  end if;
  if n > 0 then update public.plan_sessions set last_at = clock_timestamp(), changes = changes + n where id = sid; end if;
  return null;
end $$;

create or replace function private.plan_log_excluded()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare sid bigint := private.plan_session();
begin
  insert into public.plan_changes (session_id, kind, day) values (sid, case when tg_op = 'INSERT' then 'exclude' else 'include' end, coalesce(new.day, old.day));
  update public.plan_sessions set last_at = clock_timestamp(), changes = changes + 1 where id = sid;
  return null;
end $$;

create trigger assignments_history_statement before insert or update or delete on public.assignments
  for each statement execute function private.plan_before_statement();
create trigger assignments_history after insert or update or delete on public.assignments
  for each row execute function private.plan_log_assignment();
create trigger excluded_days_history_statement before insert or delete on public.excluded_days
  for each statement execute function private.plan_before_statement();
create trigger excluded_days_history after insert or delete on public.excluded_days
  for each row execute function private.plan_log_excluded();

-- Ripristino (solo Space admin): riporta turni, puntine e giorni non richiesti com'erano all'inizio della
-- sessione. I giorni erogati restano come sono; i turni di persone eliminate non si possono ripristinare.
-- Il ripristino è a sua volta una sessione (chiusa), quindi si può annullare.
create or replace function public.restore_plan_session(p_session bigint)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare snap jsonb; sid bigint; erogati text[]; missing int; locked int;
begin
  if coalesce(private.my_role() <> 'super_admin', true) then
    raise exception 'Solo lo Space admin può ripristinare' using errcode = '42501';
  end if;
  select s.snapshot into snap from public.plan_sessions s where s.id = p_session;
  if snap is null then raise exception 'Sessione non trovata' using errcode = '22023'; end if;
  insert into public.plan_sessions (user_id, user_name, snapshot, closed, restore_of)
    values (private.actor_id(), private.actor_name(), private.plan_snapshot(), true, p_session) returning id into sid;
  perform set_config('app.plan_session', sid::text, true);
  select coalesce(array_agg(d.day::text), '{}') into erogati from public.day_status d;

  delete from public.assignments a
   where not (snap -> 'a' ? a.slot_id) and not (left(a.slot_id, 10) = any (erogati));
  insert into public.assignments (slot_id, person_id, pinned)
    select t.k, t.v ->> 'p', coalesce((t.v ->> 'pin')::boolean, false)
      from jsonb_each(snap -> 'a') as t(k, v)
     where not (left(t.k, 10) = any (erogati)) and exists (select 1 from public.people pe where pe.id = t.v ->> 'p')
  on conflict (slot_id) do update set person_id = excluded.person_id, pinned = excluded.pinned
    where public.assignments.person_id is distinct from excluded.person_id or public.assignments.pinned is distinct from excluded.pinned;

  delete from public.excluded_days x
   where not (x.day::text in (select jsonb_array_elements_text(snap -> 'x')));
  insert into public.excluded_days (day)
    select j::date from jsonb_array_elements_text(snap -> 'x') as j where not (j = any (erogati))
  on conflict do nothing;

  select count(*) into missing from jsonb_each(snap -> 'a') as t(k, v)
   where not exists (select 1 from public.people pe where pe.id = t.v ->> 'p');
  select count(*) into locked from unnest(erogati) as e;
  return jsonb_build_object('session', sid, 'missing_people', missing, 'erogati', locked,
    'changes', (select s.changes from public.plan_sessions s where s.id = sid));
end $$;

-- ---------- 2. Dati ----------

create table public.data_changes (
  id bigint generated always as identity primary key,
  at timestamptz not null default clock_timestamp(),
  user_id uuid references public.profiles(id) on delete set null,
  user_name text not null,
  area text not null check (area in ('parametri', 'anagrafica', 'team', 'account', 'impostazioni')),
  action text not null check (action in ('insert', 'update', 'delete')),
  target_id text,
  target_name text,
  -- campo → [prima, dopo]
  changes jsonb not null default '{}'::jsonb,
  -- voci riservate allo Space admin (dati retributivi, vista completa)
  restricted boolean not null default false
);
create index data_changes_at on public.data_changes (at desc);

create or replace function private.jsonb_diff(o jsonb, n jsonb, skip text[])
returns jsonb language sql immutable set search_path = ''
as $$
  select coalesce(jsonb_object_agg(k, jsonb_build_array(o -> k, n -> k)), '{}'::jsonb)
    from (select jsonb_object_keys(coalesce(o, '{}'::jsonb)) as k union select jsonb_object_keys(coalesce(n, '{}'::jsonb))) keys
   where not (k = any (skip)) and (o -> k) is distinct from (n -> k)
$$;

create or replace function private.log_data(p_area text, p_action text, p_id text, p_name text, p_changes jsonb, p_restricted boolean default false)
returns void language sql security definer set search_path = ''
as $$
  insert into public.data_changes (user_id, user_name, area, action, target_id, target_name, changes, restricted)
  values (private.actor_id(), private.actor_name(), p_area, p_action, p_id, p_name, coalesce(p_changes, '{}'::jsonb), p_restricted)
$$;

create or replace function private.log_settings()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare d jsonb := private.jsonb_diff(old.params, new.params, array['ndRal']);
begin
  if d <> '{}'::jsonb then perform private.log_data('parametri', 'update', null, 'Parametri', d); end if;
  return null;
end $$;
create trigger settings_history after update on public.settings for each row execute function private.log_settings();

create or replace function private.log_people()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare skip text[] := array['updated_at', 'sort', 'color', 'id']; d jsonb;
begin
  if tg_op = 'INSERT' then
    perform private.log_data('anagrafica', 'insert', new.id, new.name, private.jsonb_diff('{}'::jsonb, to_jsonb(new), skip));
  elsif tg_op = 'DELETE' then
    perform private.log_data('anagrafica', 'delete', old.id, old.name, private.jsonb_diff(to_jsonb(old), '{}'::jsonb, skip));
  else
    d := private.jsonb_diff(to_jsonb(old), to_jsonb(new), skip);
    if d <> '{}'::jsonb then perform private.log_data('anagrafica', 'update', new.id, new.name, d); end if;
  end if;
  return null;
end $$;
create trigger people_history after insert or update or delete on public.people for each row execute function private.log_people();

-- Dettagli della scheda (disponibilità, ferie, riserva, email): solo le modifiche, non la creazione
create or replace function private.log_people_details()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare d jsonb := private.jsonb_diff(to_jsonb(old), to_jsonb(new), array['updated_at', 'person_id']);
begin
  if d <> '{}'::jsonb then
    perform private.log_data('anagrafica', 'update', new.person_id, (select pe.name from public.people pe where pe.id = new.person_id), d);
  end if;
  return null;
end $$;
create trigger people_details_history after update on public.people_details for each row execute function private.log_people_details();

-- Livello e RAL: solo quali campi sono cambiati, mai i valori; voce riservata allo Space admin
create or replace function private.log_people_private()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare d jsonb;
begin
  select coalesce(jsonb_object_agg(k, true), '{}'::jsonb) into d
    from jsonb_object_keys(private.jsonb_diff(to_jsonb(old), to_jsonb(new), array['updated_at', 'person_id'])) as k;
  if d <> '{}'::jsonb then
    perform private.log_data('anagrafica', 'update', new.person_id, (select pe.name from public.people pe where pe.id = new.person_id), d, true);
  end if;
  return null;
end $$;
create trigger people_private_history after update on public.people_private for each row execute function private.log_people_private();

create or replace function private.log_teams()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then perform private.log_data('team', 'insert', new.id, new.label, jsonb_build_object('label', jsonb_build_array(null, new.label)));
  elsif tg_op = 'DELETE' then perform private.log_data('team', 'delete', old.id, old.label, jsonb_build_object('label', jsonb_build_array(old.label, null)));
  elsif old.label is distinct from new.label then perform private.log_data('team', 'update', new.id, new.label, jsonb_build_object('label', jsonb_build_array(old.label, new.label)));
  end if;
  return null;
end $$;
create trigger teams_history after insert or update or delete on public.teams for each row execute function private.log_teams();

-- Account: i campi della vista completa finiscono in una voce separata, riservata allo Space admin
create or replace function private.log_profiles()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  hidden text[] := array['full_view_allowed', 'full_view'];
  skip text[] := array['id', 'created_at'];
  o jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  n jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  d jsonb := private.jsonb_diff(o, n, skip || hidden);
  r jsonb := private.jsonb_diff(o, n, skip || array['email', 'display_name', 'role', 'must_change_password', 'team', 'person_id', 'turnista_view', 'summary_all']);
  act text := lower(tg_op);
  who text := coalesce(nullif(btrim(coalesce(n, o) ->> 'display_name'), ''), coalesce(n, o) ->> 'email');
  tid text := coalesce(n, o) ->> 'id';
begin
  if d <> '{}'::jsonb or tg_op <> 'UPDATE' then perform private.log_data('account', act, tid, who, d); end if;
  if tg_op = 'UPDATE' and r <> '{}'::jsonb then perform private.log_data('account', 'update', tid, who, r, true); end if;
  return null;
end $$;
create trigger profiles_history after insert or update or delete on public.profiles for each row execute function private.log_profiles();

create or replace function private.log_calendar_settings()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.turnista_names is distinct from new.turnista_names then
    perform private.log_data('impostazioni', 'update', 'turnista_names', 'Visibilità dei Turnisti', jsonb_build_object('turnista_names', jsonb_build_array(old.turnista_names, new.turnista_names)));
  end if;
  return null;
end $$;
create trigger calendar_settings_history after update on public.calendar_settings for each row execute function private.log_calendar_settings();

-- ---------- 3. Attività sugli interventi ----------

create table public.activity_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default clock_timestamp(),
  user_id uuid references public.profiles(id) on delete set null,
  user_name text not null,
  kind text not null check (kind in ('iv_insert', 'iv_update', 'iv_delete', 'iv_approved', 'iv_rejected', 'iv_pending', 'no_int', 'no_int_clear')),
  slot_id text,
  person_id text,
  person_name text,
  start_at timestamp,
  end_at timestamp,
  note text
);
create index activity_log_at on public.activity_log (at desc);

create or replace function private.log_intervention()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare k text; r public.interventions := coalesce(new, old); nt text;
begin
  if tg_op = 'INSERT' then k := 'iv_insert'; nt := new.note;
  elsif tg_op = 'DELETE' then k := 'iv_delete'; nt := old.note;
  elsif old.start_at is distinct from new.start_at or old.end_at is distinct from new.end_at or old.note is distinct from new.note or old.resend_comment is distinct from new.resend_comment then
    k := 'iv_update'; nt := coalesce(nullif(new.resend_comment, ''), new.note);
  elsif old.status is distinct from new.status then
    k := case new.status when 'approved' then 'iv_approved' when 'rejected' then 'iv_rejected' else 'iv_pending' end;
    nt := case when new.status = 'rejected' then new.reject_reason end;
  else return null;
  end if;
  insert into public.activity_log (user_id, user_name, kind, slot_id, person_id, person_name, start_at, end_at, note)
  values (private.actor_id(), private.actor_name(), k, r.slot_id, r.person_id, (select pe.name from public.people pe where pe.id = r.person_id), r.start_at, r.end_at, nt);
  return null;
end $$;
create trigger interventions_history after insert or update or delete on public.interventions for each row execute function private.log_intervention();

create or replace function private.log_no_intervention()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare r public.shift_no_intervention := coalesce(new, old);
begin
  insert into public.activity_log (user_id, user_name, kind, slot_id, person_id, person_name)
  values (private.actor_id(), private.actor_name(), case when tg_op = 'INSERT' then 'no_int' else 'no_int_clear' end, r.slot_id, r.person_id,
          (select pe.name from public.people pe where pe.id = r.person_id));
  return null;
end $$;
create trigger shift_no_intervention_history after insert or delete on public.shift_no_intervention for each row execute function private.log_no_intervention();

-- ---------- Accesso ----------

alter table public.plan_sessions enable row level security;
alter table public.plan_changes enable row level security;
alter table public.data_changes enable row level security;
alter table public.activity_log enable row level security;
revoke all on public.plan_sessions, public.plan_changes, public.data_changes, public.activity_log from anon, authenticated;
grant select on public.plan_sessions, public.plan_changes, public.data_changes, public.activity_log to authenticated;
create policy "plan_sessions: lettura" on public.plan_sessions for select using ((select private.can_read_history()));
create policy "plan_changes: lettura" on public.plan_changes for select using ((select private.can_read_history()));
create policy "data_changes: lettura" on public.data_changes for select
  using ((select private.can_read_history()) and (not restricted or (select private.my_role()) = 'super_admin'));
create policy "activity_log: lettura" on public.activity_log for select using ((select private.can_read_history()));

revoke execute on function private.can_read_history(), private.actor_id(), private.actor_name(), private.plan_snapshot(), private.plan_session(),
  private.plan_before_statement(), private.plan_log_assignment(), private.plan_log_excluded(), public.restore_plan_session(bigint),
  private.jsonb_diff(jsonb, jsonb, text[]), private.log_data(text, text, text, text, jsonb, boolean), private.log_settings(), private.log_people(),
  private.log_people_details(), private.log_people_private(), private.log_teams(), private.log_profiles(), private.log_calendar_settings(),
  private.log_intervention(), private.log_no_intervention() from public, anon;
grant execute on function private.can_read_history(), public.restore_plan_session(bigint) to authenticated;
