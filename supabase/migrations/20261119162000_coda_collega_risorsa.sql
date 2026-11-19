-- La coda delle richieste utenti accetta anche il collegamento account → risorsa (Turnista).
alter table public.admin_requests drop constraint if exists admin_requests_action_check;
alter table public.admin_requests add constraint admin_requests_action_check
  check (action in ('create', 'reset', 'set_role', 'set_team', 'set_person', 'delete'));
