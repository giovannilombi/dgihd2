-- Da applicare SUBITO DOPO la pubblicazione dell'app che legge people_private
-- (la versione precedente legge ancora queste colonne).
-- Livello, RAL e Q/ restano solo in people_private, visibili per team.
alter table public.people_details drop column level, drop column ral, drop column ral_nd;
