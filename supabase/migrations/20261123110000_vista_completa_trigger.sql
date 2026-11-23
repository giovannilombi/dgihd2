-- Il controllo di coerenza sui profili gira anche per le modifiche fatte dalla funzione admin-users
-- (ruolo service_role, senza accesso alle funzioni dello schema private): regola scritta per esteso,
-- senza richiamare altre funzioni.
create or replace function private.full_view_consistency()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.role::text not in ('governance', 'director', 'hr') then new.full_view_allowed := false; end if;
  if not (new.role::text = 'super_admin' or (new.role::text in ('governance', 'director', 'hr') and new.full_view_allowed)) then
    new.full_view := false;
  end if;
  return new;
end $$;
