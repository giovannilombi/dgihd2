-- I miei turni: aggiunge le regole di conteggio delle ore (minimo e tolleranza, dai Parametri → blocco B),
-- così chi non legge i parametri (es. Turnista) vede le stesse ore riconosciute. Nessun dato riservato.
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
    'rules', (select jsonb_build_object('otMinHours', s.params->'otMinHours', 'otToleranceMin', s.params->'otToleranceMin') from public.settings s where s.id = 1),
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
