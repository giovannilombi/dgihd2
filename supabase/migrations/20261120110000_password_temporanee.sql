-- Password temporanee ancora da cambiare: il super admin può ricopiarle dalla lista utenti per
-- comunicarle di nuovo. Nessun utente legge la tabella (RLS senza regole, permessi revocati): la
-- espone solo la funzione "admin-users" al super admin. La riga sparisce appena la persona sceglie
-- la propria password (o quando l'account viene eliminato).
create table if not exists public.temp_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  password text not null,
  created_at timestamptz not null default now()
);
alter table public.temp_credentials enable row level security;
revoke all on public.temp_credentials from anon, authenticated;

create or replace function private.clear_temp_credentials()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.temp_credentials where user_id = new.id;
  return new;
end $$;
revoke execute on function private.clear_temp_credentials() from public, anon, authenticated;

drop trigger if exists profiles_clear_temp_credentials on public.profiles;
create trigger profiles_clear_temp_credentials
  after update of must_change_password on public.profiles
  for each row when (new.must_change_password = false)
  execute function private.clear_temp_credentials();
