-- Il team di una risorsa decide chi ne vede RAL e livello: cambiarlo è riservato a chi vede già
-- tutto (HR e Governance), altrimenti un editor potrebbe spostare una persona nel proprio team
-- e leggerne la RAL. Le funzioni server (service role, senza utente) non sono soggette al controllo.
create or replace function private.guard_people_team()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and new.team is distinct from old.team
     and coalesce(private.my_team(), '') not in ('hr', 'governance') then
    raise exception 'Solo HR e Governance possono cambiare il team di una risorsa' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function private.guard_people_team() from public, anon, authenticated;

create trigger people_team_guard
  before update of team on public.people
  for each row execute function private.guard_people_team();

-- Transizione: livello e RAL passano in people_private; finché le vecchie colonne esistono
-- servono un default per gli inserimenti della nuova versione dell'app.
alter table public.people_details alter column level set default 'B1';
