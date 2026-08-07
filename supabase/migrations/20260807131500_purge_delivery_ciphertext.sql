alter table public.entregas_acceso alter column codigo_cifrado drop not null;
alter table public.entregas_acceso alter column cifrado_iv drop not null;
alter table public.entregas_acceso alter column cifrado_auth_tag drop not null;
