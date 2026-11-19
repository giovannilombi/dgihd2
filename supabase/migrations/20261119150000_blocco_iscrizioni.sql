-- Gli account li crea solo la funzione admin-users (super admin o coda richieste): prima di creare
-- l'utente registra l'email in questa lista, valida 10 minuti. Ogni altro inserimento in auth.users
-- (iscrizione libera, link magico, accesso anonimo) viene rifiutato dal database.
create table public.signup_allowlist (
  email text primary key,
  created_at timestamptz not null default now()
);
alter table public.signup_allowlist enable row level security;
revoke all on public.signup_allowlist from anon, authenticated;

create or replace function private.guard_signup()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.signup_allowlist
   where email = lower(coalesce(new.email, '')) and created_at > now() - interval '10 minutes';
  if not found then
    raise exception 'Registrazione non consentita: gli account li crea il super admin' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function private.guard_signup() from public, anon, authenticated;

create trigger signup_guard before insert on auth.users
  for each row execute function private.guard_signup();
