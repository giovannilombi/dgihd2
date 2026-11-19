-- L'email della risorsa è obbligatoria (da applicare dopo il rilascio del sito che la invia sempre).
alter table public.people_details alter column email set not null;
