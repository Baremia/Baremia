create table if not exists public.estimaciones_snapshots (
  id uuid primary key default gen_random_uuid(),
  convocatoria_id uuid not null references public.convocatorias(id) on delete cascade,
  modelo_version text,
  total_registros integer not null default 0,
  motivo text,
  created_at timestamptz not null default now()
);

create table if not exists public.estimaciones_snapshot_filas (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.estimaciones_snapshots(id) on delete cascade,
  candidato_id uuid not null references public.candidatos(id) on delete cascade,
  listado_id uuid references public.listados(id) on delete set null,
  posicion_estimada integer not null,
  posicion_minima integer,
  posicion_maxima integer,
  probabilidad_plaza numeric,
  metodologia_version text,
  comentario text,
  estimacion_created_at timestamptz not null,
  puntuacion_oposicion numeric,
  meritos_estimados numeric,
  puntuacion_total_estimada numeric,
  nivel_confianza text,
  metodo_estimacion text,
  datos_modelo jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(snapshot_id, candidato_id)
);

create index if not exists estimaciones_snapshots_convocatoria_created_idx
  on public.estimaciones_snapshots(convocatoria_id, created_at desc);
create index if not exists estimaciones_snapshot_filas_snapshot_idx
  on public.estimaciones_snapshot_filas(snapshot_id);
create index if not exists estimaciones_snapshot_filas_candidato_idx
  on public.estimaciones_snapshot_filas(candidato_id);

alter table public.estimaciones_snapshots enable row level security;
alter table public.estimaciones_snapshot_filas enable row level security;

create or replace function baremia.crear_snapshot_estimaciones(
  p_convocatoria_id uuid,
  p_motivo text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot_id uuid;
  v_total integer;
  v_modelo text;
begin
  select count(*), max(e.metodologia_version)
    into v_total, v_modelo
  from public.estimaciones e
  join public.candidatos c on c.id = e.candidato_id
  where c.convocatoria_id = p_convocatoria_id;

  if v_total = 0 then
    raise exception 'No existen estimaciones activas para la convocatoria';
  end if;

  insert into public.estimaciones_snapshots(
    convocatoria_id, modelo_version, total_registros, motivo
  ) values (
    p_convocatoria_id, v_modelo, v_total, p_motivo
  ) returning id into v_snapshot_id;

  insert into public.estimaciones_snapshot_filas(
    snapshot_id, candidato_id, listado_id,
    posicion_estimada, posicion_minima, posicion_maxima,
    probabilidad_plaza, metodologia_version, comentario,
    estimacion_created_at, puntuacion_oposicion, meritos_estimados,
    puntuacion_total_estimada, nivel_confianza, metodo_estimacion, datos_modelo
  )
  select
    v_snapshot_id, e.candidato_id, e.listado_id,
    e.posicion_estimada, e.posicion_minima, e.posicion_maxima,
    e.probabilidad_plaza, e.metodologia_version, e.comentario,
    e.created_at, e.puntuacion_oposicion, e.meritos_estimados,
    e.puntuacion_total_estimada, e.nivel_confianza, e.metodo_estimacion, e.datos_modelo
  from public.estimaciones e
  join public.candidatos c on c.id = e.candidato_id
  where c.convocatoria_id = p_convocatoria_id;

  return v_snapshot_id;
end;
$$;

create or replace function baremia.restaurar_snapshot_estimaciones(
  p_snapshot_id uuid
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_convocatoria_id uuid;
  v_esperados integer;
  v_filas integer;
begin
  select convocatoria_id, total_registros
    into v_convocatoria_id, v_esperados
  from public.estimaciones_snapshots
  where id = p_snapshot_id;

  if v_convocatoria_id is null then
    raise exception 'Snapshot no encontrado';
  end if;

  select count(*) into v_filas
  from public.estimaciones_snapshot_filas
  where snapshot_id = p_snapshot_id;

  if v_filas <> v_esperados then
    raise exception 'Snapshot incompleto: % filas de % esperadas', v_filas, v_esperados;
  end if;

  delete from public.estimaciones e
  using public.candidatos c
  where c.id = e.candidato_id
    and c.convocatoria_id = v_convocatoria_id;

  insert into public.estimaciones(
    candidato_id, listado_id,
    posicion_estimada, posicion_minima, posicion_maxima,
    probabilidad_plaza, metodologia_version, comentario, created_at,
    puntuacion_oposicion, meritos_estimados, puntuacion_total_estimada,
    nivel_confianza, metodo_estimacion, datos_modelo
  )
  select
    candidato_id, listado_id,
    posicion_estimada, posicion_minima, posicion_maxima,
    probabilidad_plaza, metodologia_version, comentario, estimacion_created_at,
    puntuacion_oposicion, meritos_estimados, puntuacion_total_estimada,
    nivel_confianza, metodo_estimacion, datos_modelo
  from public.estimaciones_snapshot_filas
  where snapshot_id = p_snapshot_id;

  get diagnostics v_filas = row_count;
  return v_filas;
end;
$$;

create or replace function baremia.promover_modelo_sombra(
  p_convocatoria_id uuid,
  p_modelo_sombra text,
  p_modelo_publico text,
  p_motivo text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sombra integer;
  v_actual integer;
  v_snapshot uuid;
  v_insertadas integer;
begin
  select count(*) into v_sombra
  from public.estimaciones_sombra
  where convocatoria_id = p_convocatoria_id
    and modelo_version = p_modelo_sombra;

  select count(*) into v_actual
  from public.estimaciones e
  join public.candidatos c on c.id = e.candidato_id
  where c.convocatoria_id = p_convocatoria_id;

  if v_sombra = 0 then
    raise exception 'El modelo sombra no contiene estimaciones';
  end if;
  if v_actual = 0 then
    raise exception 'No existen estimaciones públicas que proteger';
  end if;
  if v_sombra <> v_actual then
    raise exception 'Conteos incompatibles: sombra %, activas %', v_sombra, v_actual;
  end if;

  v_snapshot := baremia.crear_snapshot_estimaciones(
    p_convocatoria_id,
    coalesce(p_motivo, 'Snapshot automático antes de promover ' || p_modelo_publico)
  );

  delete from public.estimaciones e
  using public.candidatos c
  where c.id = e.candidato_id
    and c.convocatoria_id = p_convocatoria_id;

  insert into public.estimaciones(
    candidato_id, listado_id,
    posicion_estimada, posicion_minima, posicion_maxima,
    probabilidad_plaza, metodologia_version, comentario,
    puntuacion_oposicion, meritos_estimados, puntuacion_total_estimada,
    nivel_confianza, metodo_estimacion, datos_modelo
  )
  select
    s.candidato_id, s.listado_id,
    s.posicion_estimada, s.posicion_minima, s.posicion_maxima,
    s.probabilidad_plaza, p_modelo_publico,
    'Estimación basada en modelo calibrado; no constituye clasificación oficial.',
    s.puntuacion_oposicion, s.meritos_estimados, s.puntuacion_total_estimada,
    s.nivel_confianza, s.metodo_estimacion,
    (s.datos_modelo - 'publicado' - 'modelo') || jsonb_build_object(
      'publicado', true,
      'modelo', p_modelo_publico,
      'modelo_origen_sombra', p_modelo_sombra,
      'snapshot_anterior', v_snapshot
    )
  from public.estimaciones_sombra s
  where s.convocatoria_id = p_convocatoria_id
    and s.modelo_version = p_modelo_sombra;

  get diagnostics v_insertadas = row_count;

  if v_insertadas <> v_sombra then
    raise exception 'Promoción incompleta: % filas insertadas de % esperadas', v_insertadas, v_sombra;
  end if;

  return jsonb_build_object(
    'ok', true,
    'snapshot_anterior', v_snapshot,
    'modelo_publico', p_modelo_publico,
    'estimaciones_promovidas', v_insertadas
  );
end;
$$;

revoke all on public.estimaciones_snapshots from anon, authenticated;
revoke all on public.estimaciones_snapshot_filas from anon, authenticated;
revoke execute on function baremia.crear_snapshot_estimaciones(uuid,text) from public, anon, authenticated;
revoke execute on function baremia.restaurar_snapshot_estimaciones(uuid) from public, anon, authenticated;
revoke execute on function baremia.promover_modelo_sombra(uuid,text,text,text) from public, anon, authenticated;
grant execute on function baremia.crear_snapshot_estimaciones(uuid,text) to service_role;
grant execute on function baremia.restaurar_snapshot_estimaciones(uuid) to service_role;
grant execute on function baremia.promover_modelo_sombra(uuid,text,text,text) to service_role;
