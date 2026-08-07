alter table public.cruces_fuentes_meritos enable row level security;
revoke all on table public.cruces_fuentes_meritos from anon, authenticated;
grant select, insert, update, delete on table public.cruces_fuentes_meritos to service_role;

revoke execute on function baremia.recalcular_cruces_meritos(uuid) from public, anon, authenticated;
grant execute on function baremia.recalcular_cruces_meritos(uuid) to service_role;

alter function public.actualizar_updated_at() set search_path = '';

create index if not exists idx_baremos_convocatoria_documento_listado
  on public.baremos_convocatoria (documento_listado_id);
create index if not exists idx_estimaciones_sombra_listado
  on public.estimaciones_sombra (listado_id);
create index if not exists idx_listados_documento_corregido
  on public.listados (documento_corregido_id);
create index if not exists idx_pagos_acceso
  on public.pagos (acceso_id);
create index if not exists idx_pagos_candidato
  on public.pagos (candidato_id);
create index if not exists idx_solicitudes_eliminacion_convocatoria
  on public.solicitudes_eliminacion (convocatoria_id);
