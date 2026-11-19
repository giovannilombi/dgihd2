-- RAL non disponibile (N/D): la RAL non viene mostrata né salvata; nei calcoli si usa un valore medio
-- di riferimento conservato nei parametri (settings.params.ndRal), mai mostrato nell'interfaccia.
alter table public.people_details add column ral_nd boolean not null default false;
