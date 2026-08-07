create table if not exists public.estimaciones_sombra (
  id uuid primary key default gen_random_uuid(),
  convocatoria_id uuid not null references public.convocatorias(id) on delete cascade,
  candidato_id uuid not null references public.candidatos(id) on delete cascade,
  listado_id uuid not null references public.listados(id) on delete cascade,
  modelo_version text not null,
  posicion_estimada integer not null,
  posicion_minima integer not null,
  posicion_maxima integer not null,
  probabilidad_plaza numeric,
  puntuacion_oposicion numeric,
  meritos_estimados numeric,
  puntuacion_total_estimada numeric,
  nivel_confianza text,
  metodo_estimacion text,
  datos_modelo jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (convocatoria_id, candidato_id, modelo_version)
);

create index if not exists idx_estimaciones_sombra_convocatoria_modelo
  on public.estimaciones_sombra (convocatoria_id, modelo_version);
create index if not exists idx_estimaciones_sombra_candidato
  on public.estimaciones_sombra (candidato_id);

alter table public.estimaciones_sombra enable row level security;
revoke all on table public.estimaciones_sombra from anon, authenticated;
grant select, insert, update, delete on table public.estimaciones_sombra to service_role;

create or replace function baremia.generar_estimaciones_sombra_v11(
  p_convocatoria_id uuid,
  p_plazas_general integer default 3133,
  p_plazas_discapacidad integer default 236
)
returns table(
  estimaciones_generadas integer,
  coincidencias_directas integer,
  meritos_imputados integer,
  modelo text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listado_oposicion uuid;
  v_total integer;
  v_directas integer;
  v_imputadas integer;
begin
  select l.id
  into v_listado_oposicion
  from public.listados l
  where l.convocatoria_id = p_convocatoria_id
    and l.tipo = 'resultado_oposicion'
    and exists (
      select 1 from public.registros_listado rl where rl.listado_id = l.id
    )
  order by coalesce(l.fecha_publicacion, l.created_at::date) desc, l.created_at desc
  limit 1;

  if v_listado_oposicion is null then
    raise exception 'No existe un listado de oposición importado para la convocatoria';
  end if;

  if not exists (
    select 1 from public.cruces_fuentes_meritos cr
    where cr.convocatoria_id = p_convocatoria_id
  ) then
    raise exception 'No existen cruces de méritos calculados para la convocatoria';
  end if;

  create temporary table tmp_sombra_base on commit drop as
  select
    c.id as candidato_id,
    rl.puntuacion_oposicion,
    coalesce(rl.orden_publicado, 999999) as orden_oposicion,
    coalesce(rl.datos_extra->>'cupo_discapacidad', 'false') = 'true' as cupo_discapacidad,
    fm.puntuacion_formacion as formacion_bolsa,
    fm.puntuacion_experiencia as experiencia_bolsa,
    fm.puntuacion_total as total_bolsa,
    cr.metodo as metodo_cruce,
    cr.confianza as confianza_cruce,
    cr.score_nombre,
    cr.identificador_confirmado,
    cr.id is not null as coincidencia_directa,
    floor(coalesce(rl.puntuacion_oposicion, 0) * 2) / 2.0 as banda_oposicion
  from public.registros_listado rl
  join public.candidatos c on c.id = rl.candidato_id
  left join public.cruces_fuentes_meritos cr
    on cr.convocatoria_id = p_convocatoria_id
   and cr.candidato_id = c.id
  left join public.fuentes_meritos fm on fm.id = cr.fuente_meritos_id
  where rl.listado_id = v_listado_oposicion;

  create temporary table tmp_sombra_meritos on commit drop as
  select
    b.*,
    case
      when b.coincidencia_directa then
        least(35::numeric, coalesce(b.experiencia_bolsa, 0) * 0.60::numeric)
        + least(15::numeric, coalesce(b.formacion_bolsa, 0) * 0.75::numeric)
      else null
    end as merito_directo
  from tmp_sombra_base b;

  create temporary table tmp_sombra_bandas on commit drop as
  select
    banda_oposicion,
    percentile_cont(0.5) within group (order by merito_directo) as mediana_merito
  from tmp_sombra_meritos
  where merito_directo is not null
  group by banda_oposicion;

  create temporary table tmp_sombra_calculo on commit drop as
  select
    m.*,
    coalesce(
      m.merito_directo,
      bandas.mediana_merito,
      (select percentile_cont(0.5) within group (order by merito_directo)
       from tmp_sombra_meritos where merito_directo is not null),
      0
    )::numeric(8,3) as meritos_estimados,
    case when m.coincidencia_directa then 'media' else 'baja' end as nivel_confianza,
    case
      when m.metodo_cruce = 'nombre_aproximado_dni_enmascarado' then 350
      when m.coincidencia_directa then 250
      else 700
    end as amplitud
  from tmp_sombra_meritos m
  left join tmp_sombra_bandas bandas using (banda_oposicion);

  create temporary table tmp_sombra_ranked on commit drop as
  select
    c.*,
    (coalesce(c.puntuacion_oposicion, 0) + c.meritos_estimados)::numeric(8,3) as total_estimado,
    row_number() over (
      partition by c.cupo_discapacidad
      order by
        (coalesce(c.puntuacion_oposicion, 0) + c.meritos_estimados) desc,
        coalesce(c.puntuacion_oposicion, 0) desc,
        c.orden_oposicion asc
    )::integer as posicion_cupo
  from tmp_sombra_calculo c;

  delete from public.estimaciones_sombra
  where convocatoria_id = p_convocatoria_id
    and modelo_version = 'madrid-enfermeria-v1.1-sombra';

  insert into public.estimaciones_sombra (
    convocatoria_id,
    candidato_id,
    listado_id,
    modelo_version,
    posicion_estimada,
    posicion_minima,
    posicion_maxima,
    probabilidad_plaza,
    puntuacion_oposicion,
    meritos_estimados,
    puntuacion_total_estimada,
    nivel_confianza,
    metodo_estimacion,
    datos_modelo
  )
  select
    p_convocatoria_id,
    r.candidato_id,
    v_listado_oposicion,
    'madrid-enfermeria-v1.1-sombra',
    r.posicion_cupo,
    greatest(1, r.posicion_cupo - r.amplitud),
    r.posicion_cupo + r.amplitud,
    case
      when r.nivel_confianza = 'baja' then least(
        80::numeric,
        round(100::numeric / (1 + exp(
          (r.posicion_cupo - case when r.cupo_discapacidad then p_plazas_discapacidad else p_plazas_general end)::numeric
          / greatest(40, r.amplitud / 3)::numeric
        )), 1)
      )
      else least(
        95::numeric,
        round(100::numeric / (1 + exp(
          (r.posicion_cupo - case when r.cupo_discapacidad then p_plazas_discapacidad else p_plazas_general end)::numeric
          / greatest(40, r.amplitud / 3)::numeric
        )), 1)
      )
    end,
    r.puntuacion_oposicion,
    r.meritos_estimados,
    r.total_estimado,
    r.nivel_confianza,
    case
      when r.metodo_cruce = 'nombre_exacto_dni_enmascarado' then 'bolsa_nombre_dni_enmascarado'
      when r.metodo_cruce = 'nombre_aproximado_dni_enmascarado' then 'bolsa_nombre_aproximado_dni_enmascarado'
      else 'imputacion_por_banda_oposicion'
    end,
    jsonb_build_object(
      'modelo', 'madrid-enfermeria-v1.1-sombra',
      'publicado', false,
      'cruce_version', 2,
      'cupo', case when r.cupo_discapacidad then 'discapacidad' else 'general' end,
      'plazas_aplicables', case when r.cupo_discapacidad then p_plazas_discapacidad else p_plazas_general end,
      'coincidencia_bolsa', r.coincidencia_directa,
      'metodo_cruce', r.metodo_cruce,
      'confianza_cruce', r.confianza_cruce,
      'score_nombre', r.score_nombre,
      'identificador_confirmado', r.identificador_confirmado,
      'experiencia_bolsa', r.experiencia_bolsa,
      'formacion_bolsa', r.formacion_bolsa,
      'total_bolsa', r.total_bolsa,
      'factor_experiencia', 0.60,
      'factor_formacion', 0.75,
      'justificacion_experiencia', 'Equivalencia conservadora: 0,30 puntos/mes en bolsa frente a 0,006 puntos/día (0,18/mes) en OPE para experiencia pública equivalente.',
      'justificacion_formacion', 'Se mantiene temporalmente la conversión v1 por ausencia de desglose individual de los subapartados formativos.',
      'fecha_corte_bolsa', '2024-09-30'
    )
  from tmp_sombra_ranked r;

  get diagnostics v_total = row_count;
  select count(*) into v_directas from tmp_sombra_ranked where coincidencia_directa;
  v_imputadas := v_total - v_directas;

  return query select v_total, v_directas, v_imputadas, 'madrid-enfermeria-v1.1-sombra'::text;
end;
$$;

create or replace function baremia.resumen_estimaciones_sombra_v11(
  p_convocatoria_id uuid
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with comparacion as (
    select
      s.candidato_id,
      s.posicion_estimada as posicion_sombra,
      s.meritos_estimados as meritos_sombra,
      s.probabilidad_plaza as probabilidad_sombra,
      e.posicion_estimada as posicion_actual,
      e.meritos_estimados as meritos_actuales,
      e.probabilidad_plaza as probabilidad_actual,
      (s.datos_modelo->>'cupo') = 'discapacidad' as cupo_discapacidad,
      s.metodo_estimacion,
      (e.posicion_estimada - s.posicion_estimada) as mejora_puestos,
      (s.meritos_estimados - e.meritos_estimados) as delta_meritos
    from public.estimaciones_sombra s
    join public.estimaciones e
      on e.candidato_id = s.candidato_id
     and e.metodologia_version = 'madrid-enfermeria-v1'
    where s.convocatoria_id = p_convocatoria_id
      and s.modelo_version = 'madrid-enfermeria-v1.1-sombra'
  )
  select jsonb_build_object(
    'modelo', 'madrid-enfermeria-v1.1-sombra',
    'total', count(*),
    'delta_meritos_media', round(avg(delta_meritos), 3),
    'delta_meritos_mediana', round(percentile_cont(0.5) within group(order by delta_meritos)::numeric, 3),
    'cambio_posicion_abs_mediana', round(percentile_cont(0.5) within group(order by abs(mejora_puestos))::numeric, 1),
    'cambio_posicion_abs_p90', round(percentile_cont(0.9) within group(order by abs(mejora_puestos))::numeric, 1),
    'cambio_posicion_abs_max', max(abs(mejora_puestos)),
    'cambios_gt_100', count(*) filter(where abs(mejora_puestos) > 100),
    'cambios_gt_250', count(*) filter(where abs(mejora_puestos) > 250),
    'cambios_gt_500', count(*) filter(where abs(mejora_puestos) > 500),
    'entran_corte_general', count(*) filter(
      where not cupo_discapacidad and posicion_sombra <= 3133 and posicion_actual > 3133
    ),
    'salen_corte_general', count(*) filter(
      where not cupo_discapacidad and posicion_sombra > 3133 and posicion_actual <= 3133
    ),
    'directos', count(*) filter(where metodo_estimacion <> 'imputacion_por_banda_oposicion'),
    'imputados', count(*) filter(where metodo_estimacion = 'imputacion_por_banda_oposicion')
  )
  from comparacion;
$$;

revoke all on function baremia.generar_estimaciones_sombra_v11(uuid, integer, integer) from public, anon, authenticated;
revoke all on function baremia.resumen_estimaciones_sombra_v11(uuid) from public, anon, authenticated;
grant execute on function baremia.generar_estimaciones_sombra_v11(uuid, integer, integer) to service_role;
grant execute on function baremia.resumen_estimaciones_sombra_v11(uuid) to service_role;
