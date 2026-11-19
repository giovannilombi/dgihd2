-- Anche una risorsa può appartenere al team Governance (RAL e livello visibili solo a HR e Governance).
alter table public.people drop constraint people_team_check;
alter table public.people add constraint people_team_check check (team in ('tech', 'design', 'pm', 'director', 'governance'));
