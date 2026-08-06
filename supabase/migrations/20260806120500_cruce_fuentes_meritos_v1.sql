create or replace function baremia.normalizar_identidad(p_text text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select regexp_replace(
    lower(extensions.unaccent(p_text)),
    '[^a-z0-9]+',
    '',
    'g'
  );
$$;

create table if not exists public.cruces_fuentes_meritos (
  id uuid primary key default gen_random_uuid(),
  convocatoria_id uuid not null references public.convocatorias(id) on delete cascade,
  candidato_id uuid not null references public.candidatos(id) on delete cascade,
  fuente_meritos_id uuid not null references public.fuentes_meritos(id) on delete cascade,
  metodo text not null,
  confianza numeric not null default 0.98,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cruces_fuentes_meritos_metodo_check
    check (metodo in ('nombre_exacto_unico')),
  constraint cruces_fuentes_meritos_confianza_check
    check (confianza >= 0 and confianza <= 1),
  constraint cruces_fuentes_meritos_candidato_unique
    unique (convocatoria_id, candidato_id),
  constraint cruces_fuentes_meritos_fuente_unique
    unique (convocatoria_id, fuente_meritos_id)
);

create index if not exists idx_cruces_fuentes_meritos_convocatoria
  on public.cruces_fuentes_meritos (convocatoria_id);
create index if not exists idx_cruces_fuentes_meritos_candidato
  on public.cruces_fuentes_meritos (candidato_id);
create index if not exists idx_cruces_fuentes_meritos_fuente
  on public.cruces_fuentes_meritos (fuente_meritos_id);

create or replace function baremia.recalcular_cruces_meritos(
  p_convocatoria_id uuid
)
returns table(
  candidatos_total integer,
  fuentes_total integer,
  coincidencias_directas integer,
  candidatos_sin_coincidencia integer,
  cobertura_porcentaje numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidatos integer;
  v_fuentes integer;
  v_cruces integer;
begin
  delete from public.cruces_fuentes_meritos
  where convocatoria_id = p_convocatoria_id;

  with candidatos_clave as (
    select
      c.id,
      baremia.normalizar_identidad(c.nombre) as clave,
      count(*) over (
        partition by baremia.normalizar_identidad(c.nombre)
      ) as repeticiones
    from public.candidatos c
    where c.convocatoria_id = p_convocatoria_id
  ),
  fuentes_clave as (
    select
      fm.id,
      baremia.normalizar_identidad(fm.nombre_publicado) as clave,
      count(*) over (
        partition by baremia.normalizar_identidad(fm.nombre_publicado)
      ) as repeticiones
    from public.fuentes_meritos fm
    where fm.convocatoria_id = p_convocatoria_id
  )
  insert into public.cruces_fuentes_meritos (
    convocatoria_id,
    candidato_id,
    fuente_meritos_id,
    metodo,
    confianza
  )
  select
    p_convocatoria_id,
    c.id,
    f.id,
    'nombre_exacto_unico',
    0.98
  from candidatos_clave c
  join fuentes_clave f on f.clave = c.clave
  where c.clave <> ''
    and c.repeticiones = 1
    and f.repeticiones = 1;

  get diagnostics v_cruces = row_count;

  select count(*) into v_candidatos
  from public.candidatos
  where convocatoria_id = p_convocatoria_id;

  select count(*) into v_fuentes
  from public.fuentes_meritos
  where convocatoria_id = p_convocatoria_id;

  return query
  select
    v_candidatos,
    v_fuentes,
    v_cruces,
    greatest(v_candidatos - v_cruces, 0),
    round(100.0 * v_cruces / nullif(v_candidatos, 0), 2);
end;
$$;

create or replace function baremia.generar_estimaciones_v1(
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
    select 1 from public.fuentes_meritos fm
    where fm.convocatoria_id = p_convocatoria_id
  ) then
    raise exception 'No existen fuentes de méritos procesadas para la convocatoria';
  end if;

  perform baremia.recalcular_cruces_meritos(p_convocatoria_id);

  create temporary table tmp_baremia_base on commit drop as
  select
    c.id as candidato_id,
    rl.puntuacion_oposicion,
    coalesce(rl.orden_publicado, 999999) as orden_oposicion,
    coalesce((rl.datos_extra->>'cupo_discapacidad')::boolean, false) as cupo_discapacidad,
    fm.puntuacion_formacion as formacion_bolsa,
    fm.puntuacion_experiencia as experiencia_bolsa,
    fm.puntuacion_total as total_bolsa,
    (cr.id is not null) as coincidencia_directa,
    floor(coalesce(rl.puntuacion_oposicion, 0) * 2) / 2.0 as banda_oposicion
  from public.registros_listado rl
  join public.candidatos c on c.id = rl.candidato_id
  left join public.cruces_fuentes_meritos cr
    on cr.convocatoria_id = p_convocatoria_id
   and cr.candidato_id = c.id
  left join public.fuentes_meritos fm on fm.id = cr.fuente_meritos_id
  where rl.listado_id = v_listado_oposicion;

  create temporary table tmp_baremia_meritos on commit drop as
  select
    b.*,
    case
      when b.coincidencia_directa then
        least(35::numeric, coalesce(b.experiencia_bolsa, 0) * 35::numeric / 80::numeric)
        + least(15::numeric, coalesce(b.formacion_bolsa, 0) * 15::numeric / 20::numeric)
      else null
    end as merito_directo
  from tmp_baremia_base b;

  create temporary table tmp_baremia_bandas on commit drop as
  select
    banda_oposicion,
    percentile_cont(0.5) within group (order by merito_directo) as mediana_merito
  from tmp_baremia_meritos
  where merito_directo is not null
  group by banda_oposicion;

  create temporary table tmp_baremia_calculo on commit drop as
  select
    m.*,
    coalesce(
      m.merito_directo,
      bandas.mediana_merito,
      (select percentile_cont(0.5) within group (order by merito_directo)
       from tmp_baremia_meritos where merito_directo is not null),
      0
    )::numeric(8,3) as meritos_estimados,
    case when m.coincidencia_directa then 'media' else 'baja' end as nivel_confianza,
    case when m.coincidencia_directa then 250 else 700 end as amplitud
  from tmp_baremia_meritos m
  left join tmp_baremia_bandas bandas using (banda_oposicion);

  create temporary table tmp_baremia_ranked on commit drop as
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
  from tmp_baremia_calculo c;

  delete from public.estimaciones e
  using public.candidatos c
  where e.candidato_id = c.id
    and c.convocatoria_id = p_convocatoria_id
    and e.metodologia_version = 'madrid-enfermeria-v1';

  insert into public.estimaciones (
    candidato_id, listado_id, posicion_estimada, posicion_minima,
    posicion_maxima, probabilidad_plaza, metodologia_version,
    comentario, puntuacion_oposicion, meritos_estimados,
    puntuacion_total_estimada, nivel_confianza,
    metodo_estimacion, datos_modelo
  )
  select
    r.candidato_id,
    v_listado_oposicion,
    r.posicion_cupo,
    greatest(1, r.posicion_cupo - r.amplitud),
    r.posicion_cupo + r.amplitud,
    round(
      100::numeric /
      (1 + exp(
        (r.posicion_cupo - case when r.cupo_discapacidad then p_plazas_discapacidad else p_plazas_general end)::numeric
        / greatest(40, r.amplitud / 3)::numeric
      )),
      1
    ),
    'madrid-enfermeria-v1',
    case
      when r.coincidencia_directa then
        'Estimación v1 basada en la nota oficial de oposición y una coincidencia nominal única con la bolsa definitiva de Enfermería.'
      else
        'Estimación v1 basada en la nota oficial de oposición y la mediana de méritos de candidatos comparables. La incertidumbre es mayor.'
    end,
    r.puntuacion_oposicion,
    r.meritos_estimados,
    r.total_estimado,
    r.nivel_confianza,
    case when r.coincidencia_directa then 'bolsa_nombre_exacto_unico' else 'imputacion_por_banda_oposicion' end,
    jsonb_build_object(
      'modelo', 'madrid-enfermeria-v1',
      'cupo', case when r.cupo_discapacidad then 'discapacidad' else 'general' end,
      'plazas_aplicables', case when r.cupo_discapacidad then p_plazas_discapacidad else p_plazas_general end,
      'coincidencia_bolsa', r.coincidencia_directa,
      'metodo_cruce', case when r.coincidencia_directa then 'nombre_exacto_unico' else null end,
      'formacion_bolsa', r.formacion_bolsa,
      'experiencia_bolsa', r.experiencia_bolsa,
      'total_bolsa', r.total_bolsa,
      'fecha_corte_bolsa', '2024-09-30',
      'nota', 'La bolsa es una referencia estadística y no el baremo definitivo de la OPE.'
    )
  from tmp_baremia_ranked r;

  get diagnostics v_total = row_count;
  select count(*) into v_directas from tmp_baremia_ranked where coincidencia_directa;
  v_imputadas := v_total - v_directas;

  return query select v_total, v_directas, v_imputadas, 'madrid-enfermeria-v1'::text;
end;
$$;

grant execute on function baremia.recalcular_cruces_meritos(uuid) to service_role;
grant execute on function baremia.generar_estimaciones_v1(uuid, integer, integer) to service_role;
