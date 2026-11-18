-- Riserve: usate dall'auto-compilazione solo se nessun'altra risorsa è disponibile, nell'ordine indicato.
alter table public.people_details
  add column reserve boolean not null default false,
  add column reserve_order integer check (reserve_order is null or reserve_order >= 1);
