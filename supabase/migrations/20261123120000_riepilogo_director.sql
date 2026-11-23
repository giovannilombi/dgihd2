-- Riepilogo (turni e ore, senza importi): un Director vede di norma solo le persone del proprio team;
-- lo Space admin può consentirgli il riepilogo di tutti i team. Non cambia nulla per RAL e importi.
alter table public.profiles add column if not exists summary_all boolean not null default false;

-- Coerenza (scritta per esteso: gira anche per le modifiche della funzione admin-users)
create or replace function private.full_view_consistency()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.role::text not in ('governance', 'director', 'hr') then new.full_view_allowed := false; end if;
  if not (new.role::text = 'super_admin' or (new.role::text in ('governance', 'director', 'hr') and new.full_view_allowed)) then
    new.full_view := false;
  end if;
  if new.role::text <> 'director' then new.summary_all := false; end if;
  return new;
end $$;
