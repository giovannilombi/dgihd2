-- Team di risorse e utenti; RAL e livello visibili solo al proprio team (HR e Governance vedono tutto).
-- Nessun dato personale: struttura, regole e copia dei valori esistenti nella nuova tabella riservata.

alter table public.people add column team text check (team in ('tech', 'design', 'pm', 'director'));
alter table public.profiles add column team text check (team in ('tech', 'design', 'pm', 'director', 'hr', 'governance'));

-- Dati riservati per team: livello CCNL, RAL e indicazione Q/
create table public.people_private (
  person_id text primary key references public.people (id) on delete cascade,
  level text not null default 'B1' check (level in ('D1','D2','C1','C2','C3','B1','B2','B3','A1')),
  ral numeric(10, 2) not null default 0 check (ral >= 0 and ral <= 1000000),
  ral_nd boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.people_private (person_id, level, ral, ral_nd)
select person_id, level, ral, ral_nd from public.people_details;

-- Team dell'utente corrente (solo con password già cambiata, come my_role)
create or replace function private.my_team()
returns text language sql stable security definer set search_path = ''
as $$ select p.team from public.profiles p where p.id = (select auth.uid()) and p.must_change_password = false $$;

-- Può vedere RAL e livello della persona? viewer esteso/editor/super admin del suo team, oppure HR/Governance
create or replace function private.can_see_salary(pid text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.can_read_full() and (
    private.my_team() in ('hr', 'governance')
    or private.my_team() = (select pe.team from public.people pe where pe.id = pid)
  )
$$;

create or replace function private.can_edit_salary(pid text)
returns boolean language sql stable security definer set search_path = ''
as $$ select private.can_edit() and private.can_see_salary(pid) $$;

revoke execute on function private.my_team(), private.can_see_salary(text), private.can_edit_salary(text) from public, anon;
grant execute on function private.my_team(), private.can_see_salary(text), private.can_edit_salary(text) to authenticated;

alter table public.people_private enable row level security;
revoke all on public.people_private from anon;
create policy "people_private: lettura per team" on public.people_private for select to authenticated using ((select private.can_see_salary(person_id)));
create policy "people_private: inserimento per team" on public.people_private for insert to authenticated with check ((select private.can_edit_salary(person_id)));
create policy "people_private: modifica per team" on public.people_private for update to authenticated using ((select private.can_edit_salary(person_id))) with check ((select private.can_edit_salary(person_id)));
create policy "people_private: eliminazione per team" on public.people_private for delete to authenticated using ((select private.can_edit_salary(person_id)));

alter publication supabase_realtime add table public.people_private;

-- Coda gestione utenti: team e cambio team
alter table public.admin_requests add column team text check (team in ('tech', 'design', 'pm', 'director', 'hr', 'governance'));
alter table public.admin_requests drop constraint admin_requests_action_check;
alter table public.admin_requests add constraint admin_requests_action_check check (action in ('create', 'reset', 'set_role', 'set_team', 'delete'));
