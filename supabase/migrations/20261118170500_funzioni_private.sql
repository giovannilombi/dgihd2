-- Le funzioni dei ruoli non devono essere richiamabili dall'API: spostate in uno schema non esposto.
-- Le policy RLS fanno riferimento alle funzioni per OID e continuano a funzionare.
create schema if not exists private;
grant usage on schema private to authenticated;

alter function public.my_role() set schema private;
alter function public.can_read_full() set schema private;
alter function public.can_edit() set schema private;
alter function public.has_access() set schema private;

create or replace function private.can_read_full()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(private.my_role() in ('super_admin', 'editor', 'viewer_plus'), false) $$;

create or replace function private.can_edit()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(private.my_role() in ('super_admin', 'editor'), false) $$;

create or replace function private.has_access()
returns boolean language sql stable security definer set search_path = ''
as $$ select private.my_role() is not null $$;

-- ping non ha bisogno di privilegi elevati
alter function public.ping() security invoker;
