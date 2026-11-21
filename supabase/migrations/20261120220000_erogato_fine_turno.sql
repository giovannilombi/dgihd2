-- Segna erogato dalla fine del turno (non più dal giorno dopo): il giorno si può segnare quando è finito
-- l'ultimo turno assegnato di quel giorno, ora italiana. Notte: 09:00 del giorno dopo; Diurno: 18:00.

-- Fine dell'ultimo turno assegnato del giorno (ora italiana, senza fuso); null se il giorno non ha turni.
create or replace function private.day_shift_end(d date)
returns timestamp language sql stable security definer set search_path = ''
as $$
  select max(case when right(a.slot_id, 1) = 'N' then (d + 1) + time '09:00' else d + time '18:00' end)
  from public.assignments a where left(a.slot_id, 10) = d::text
$$;
revoke execute on function private.day_shift_end(date) from public, anon;
grant execute on function private.day_shift_end(date) to authenticated;

create or replace function public.mark_day_erogato(p_day date)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_end timestamp;
begin
  if not private.can_mark_day(p_day) then
    raise exception 'Non puoi segnare come erogato questo giorno' using errcode = '42501';
  end if;
  v_end := private.day_shift_end(p_day);
  if v_end is null then
    raise exception 'Nessun turno assegnato in questo giorno' using errcode = '22023';
  end if;
  if (now() at time zone 'Europe/Rome') < v_end then
    raise exception 'Il giorno si può segnare come erogato dalla fine del turno (%)', to_char(v_end, 'DD/MM HH24:MI') using errcode = '22023';
  end if;
  insert into public.day_status (day, erogato_by, erogato_by_name)
  values (p_day, (select auth.uid()), private.my_name())
  on conflict (day) do nothing;
  if not found then
    raise exception 'Il giorno è già erogato' using errcode = '22023';
  end if;
  insert into public.day_status_log (day, action, by_id, by_name) values (p_day, 'erogato', (select auth.uid()), private.my_name());
end $$;
