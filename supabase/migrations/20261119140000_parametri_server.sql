-- Parametri che non devono mai arrivare al browser (es. la RAL media di riferimento per le RAL Q/).
-- RLS attiva senza regole e nessun permesso per gli utenti: la legge solo la funzione server "planner"
-- con la chiave di servizio. Il valore si inserisce direttamente nel database, mai nel repository.
create table public.server_params (
  id int primary key default 1 check (id = 1),
  nd_ral numeric(10, 2) check (nd_ral > 0),
  updated_at timestamptz not null default now()
);
alter table public.server_params enable row level security;
revoke all on public.server_params from anon, authenticated;
