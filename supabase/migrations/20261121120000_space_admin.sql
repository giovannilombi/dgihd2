-- Il profilo Super admin si chiama "Space admin" nei testi: aggiorna i messaggi delle funzioni.
-- Il valore tecnico del profilo resta 'super_admin'. Logica invariata.

create or replace function private.guard_people_team()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and new.team is distinct from old.team
     and not private.sees_all() then
    raise exception 'Solo Governance e Space admin possono cambiare il team di una risorsa' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function private.guard_signup()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.signup_allowlist
   where email = lower(coalesce(new.email, '')) and created_at > now() - interval '10 minutes';
  if not found then
    raise exception 'Registrazione non consentita: gli account li crea lo Space admin' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.unlock_day(p_day date, p_note text default null)
returns text language plpgsql security definer set search_path = ''
as $$
declare s public.day_status;
begin
  if not private.can_unlock_day(p_day) then
    raise exception 'Solo il capo del team o lo Space admin possono sbloccare questo giorno' using errcode = '42501';
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
    raise exception 'Solo il capo del team, i PM o lo Space admin possono decidere su questo intervento' using errcode = '42501';
  end if;
  if i.person_id = private.my_person_id() and private.my_role() is distinct from 'super_admin' then
    raise exception 'Un tuo intervento lo approva lo Space admin' using errcode = '42501';
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
