-- Coda di richieste di gestione utenti (creazione/reset/livello/eliminazione) inseribili solo
-- da chi ha accesso amministrativo al progetto (pannello Supabase o connessione MCP).
-- Ogni inserimento invia una chiamata firmata alla funzione admin-users, che esegue la richiesta
-- con l'API ufficiale di Supabase Auth e scrive l'esito nella riga.
-- Il token di firma è generato nel database e custodito nel Vault: non compare in questo file.

create extension if not exists pg_net with schema extensions;

select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'admin_cli_token',
  'Firma interna delle richieste di gestione utenti inviate dalla coda admin_requests');

create table public.admin_requests (
  id bigint generated always as identity primary key,
  action text not null check (action in ('create', 'reset', 'set_role', 'delete')),
  email text not null,
  display_name text not null default '',
  role public.app_role,
  status text not null default 'pending' check (status in ('pending', 'done', 'error')),
  temp_password text,
  error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
alter table public.admin_requests enable row level security;
revoke all on public.admin_requests from anon, authenticated;

-- Verifica del token: eseguibile solo dalla funzione server (service role)
create or replace function public.verify_cli_token(t text)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from vault.decrypted_secrets where name = 'admin_cli_token' and decrypted_secret = t) $$;
revoke execute on function public.verify_cli_token(text) from public, anon, authenticated;
grant execute on function public.verify_cli_token(text) to service_role;

-- Dopo ogni inserimento: chiamata firmata alla funzione admin-users
create or replace function private.dispatch_admin_requests()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare tok text;
begin
  select decrypted_secret into tok from vault.decrypted_secrets where name = 'admin_cli_token';
  perform net.http_post(
    url := 'https://tvmvxfspsjabcluebzfg.supabase.co/functions/v1/admin-users',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- chiave pubblica "anon" (già nel sito): serve solo a superare il gateway; l'autorizzazione è il token
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2bXZ4ZnNwc2phYmNsdWViemZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUwMTY2MDUsImV4cCI6MjExMDU5MjYwNX0.x-of7o-6LYtbN5r-zHnBRzJjJti5UpIrh78lxrNA-ZU',
      'x-cli-token', tok),
    body := jsonb_build_object('action', 'process_requests'));
  return null;
end $$;
revoke execute on function private.dispatch_admin_requests() from public, anon, authenticated;

create trigger admin_requests_dispatch
  after insert on public.admin_requests
  for each statement execute function private.dispatch_admin_requests();
