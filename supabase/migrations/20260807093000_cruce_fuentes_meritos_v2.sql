alter table public.cruces_fuentes_meritos
  add column if not exists score_nombre numeric,
  add column if not exists identificador_confirmado boolean not null default false,
  add column if not exists datos_match jsonb not null default '{}'::jsonb;

alter table public.cruces_fuentes_meritos
  drop constraint if exists cruces_fuentes_meritos_metodo_check;

alter table public.cruces_fuentes_meritos
  add constraint cruces_fuentes_meritos_metodo_check
  check (metodo in (
    'nombre_exacto_unico',
    'nombre_exacto_dni_enmascarado',
    'nombre_aproximado_dni_enmascarado'
  ));

create or replace function baremia.dni_publicado_compatible(
  p_dni_ope text,
  p_dni_bolsa text
)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  with datos as (
    select
      regexp_replace(p_dni_ope, '\D', '', 'g') as ope_digits,
      regexp_replace(p_dni_bolsa, '\D', '', 'g') as bolsa_digits,
      regexp_replace(p_dni_ope, '[A-Za-z0-9]', '#', 'g') as patron_ope
  )
  select case
    when length(ope_digits) <> 4 or length(bolsa_digits) <> 4 then false
    when patron_ope = '***####**' then right(ope_digits, 3) = left(bolsa_digits, 3)
    when patron_ope = '****####*' then ope_digits = bolsa_digits
    else false
  end
  from datos;
$$;

create or replace function baremia.nombre_tokens(p_text text)
returns text[]
language sql
immutable
strict
set search_path = ''
as $$
  select regexp_split_to_array(
    trim(regexp_replace(lower(extensions.unaccent(p_text)), '[^a-z0-9]+', ' ', 'g')),
    '\s+'
  );
$$;

create or replace function baremia.similitud_trigramas_nombre(
  p_a text,
  p_b text
)
returns numeric
language sql
immutable
strict
set search_path = ''
as $$
  with normalizados as (
    select
      baremia.normalizar_identidad(p_a) as a,
      baremia.normalizar_identidad(p_b) as b
  ),
  ta as (
    select distinct substr(n.a, g, 3) as tri
    from normalizados n,
         generate_series(1, greatest(length(n.a) - 2, 1)) g
  ),
  tb as (
    select distinct substr(n.b, g, 3) as tri
    from normalizados n,
         generate_series(1, greatest(length(n.b) - 2, 1)) g
  ),
  conteos as (
    select
      (select count(*) from ta) as na,
      (select count(*) from tb) as nb,
      (select count(*) from (select tri from ta intersect select tri from tb) x) as comunes,
      (select a from normalizados) as a,
      (select b from normalizados) as b
  )
  select case
    when a = b then 1::numeric
    when na + nb = 0 then 0::numeric
    else (2::numeric * comunes::numeric) / (na + nb)::numeric
  end
  from conteos;
$$;

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

  create temporary table tmp_match_candidates on commit drop as
  select
    c.id as candidato_id,
    c.nombre,
    baremia.normalizar_identidad(c.nombre) as nombre_key,
    d.dni_publicado as dni_ope,
    regexp_replace(coalesce(d.dni_publicado, ''), '\D', '', 'g') as bloque_ope,
    regexp_replace(coalesce(d.dni_publicado, ''), '[A-Za-z0-9]', '#', 'g') as patron_ope,
    case
      when regexp_replace(coalesce(d.dni_publicado, ''), '[A-Za-z0-9]', '#', 'g') = '***####**' then 'dni3'
      when regexp_replace(coalesce(d.dni_publicado, ''), '[A-Za-z0-9]', '#', 'g') = '****####*' then 'nie4'
      else null
    end as match_tipo,
    case
      when regexp_replace(coalesce(d.dni_publicado, ''), '[A-Za-z0-9]', '#', 'g') = '***####**'
        then right(regexp_replace(coalesce(d.dni_publicado, ''), '\D', '', 'g'), 3)
      when regexp_replace(coalesce(d.dni_publicado, ''), '[A-Za-z0-9]', '#', 'g') = '****####*'
        then regexp_replace(coalesce(d.dni_publicado, ''), '\D', '', 'g')
      else null
    end as match_key,
    baremia.nombre_tokens(c.nombre) as tokens
  from public.candidatos c
  left join lateral (
    select rl.dni_publicado
    from public.registros_listado rl
    join public.listados l on l.id = rl.listado_id
    where rl.candidato_id = c.id
      and l.convocatoria_id = p_convocatoria_id
      and l.tipo = 'resultado_oposicion'
      and coalesce(trim(rl.dni_publicado), '') <> ''
    order by coalesce(l.fecha_publicacion, l.created_at::date) desc,
             rl.created_at desc
    limit 1
  ) d on true
  where c.convocatoria_id = p_convocatoria_id;

  create temporary table tmp_match_sources on commit drop as
  select
    fm.id as fuente_id,
    fm.nombre_publicado,
    baremia.normalizar_identidad(fm.nombre_publicado) as nombre_key,
    fm.dni_publicado,
    regexp_replace(coalesce(fm.dni_publicado, ''), '\D', '', 'g') as bloque_bolsa,
    baremia.nombre_tokens(fm.nombre_publicado) as tokens
  from public.fuentes_meritos fm
  where fm.convocatoria_id = p_convocatoria_id;

  create temporary table tmp_match_source_keys on commit drop as
  select fuente_id, 'dni3'::text as match_tipo, left(bloque_bolsa, 3) as match_key
  from tmp_match_sources
  where length(bloque_bolsa) = 4
  union all
  select fuente_id, 'nie4'::text as match_tipo, bloque_bolsa as match_key
  from tmp_match_sources
  where length(bloque_bolsa) = 4;

  create index on tmp_match_candidates(match_tipo, match_key);
  create index on tmp_match_source_keys(match_tipo, match_key);
  create index on tmp_match_sources(fuente_id);

  create temporary table tmp_match_exact_pairs on commit drop as
  select
    c.candidato_id,
    f.fuente_id,
    c.patron_ope,
    count(*) over (partition by c.candidato_id) as candidato_degree,
    count(*) over (partition by f.fuente_id) as fuente_degree
  from tmp_match_candidates c
  join tmp_match_source_keys sk
    on sk.match_tipo = c.match_tipo
   and sk.match_key = c.match_key
  join tmp_match_sources f
    on f.fuente_id = sk.fuente_id
   and f.nombre_key = c.nombre_key
  where c.nombre_key <> ''
    and c.match_tipo is not null
    and c.match_key is not null;

  insert into public.cruces_fuentes_meritos (
    convocatoria_id,
    candidato_id,
    fuente_meritos_id,
    metodo,
    confianza,
    score_nombre,
    identificador_confirmado,
    datos_match
  )
  select
    p_convocatoria_id,
    e.candidato_id,
    e.fuente_id,
    'nombre_exacto_dni_enmascarado',
    0.995,
    1,
    true,
    jsonb_build_object(
      'version', 2,
      'regla_identificador', case
        when e.patron_ope = '***####**' then 'solapamiento_3_digitos'
        when e.patron_ope = '****####*' then 'bloque_4_digitos'
        else 'desconocida'
      end,
      'score_nombre', 1
    )
  from tmp_match_exact_pairs e
  where e.candidato_degree = 1
    and e.fuente_degree = 1;

  create temporary table tmp_match_pairs on commit drop as
  select *
  from (
    select
      c.candidato_id,
      c.nombre,
      c.dni_ope,
      c.patron_ope,
      c.tokens as c_tokens,
      f.fuente_id,
      f.nombre_publicado,
      f.dni_publicado,
      f.tokens as f_tokens,
      (
        select count(*)
        from (
          select distinct unnest(c.tokens) as t
          intersect
          select distinct unnest(f.tokens) as t
        ) comunes_tokens
      )::integer as comunes
    from tmp_match_candidates c
    join tmp_match_source_keys sk
      on sk.match_tipo = c.match_tipo
     and sk.match_key = c.match_key
    join tmp_match_sources f on f.fuente_id = sk.fuente_id
    where c.match_tipo is not null
      and not exists (
        select 1 from public.cruces_fuentes_meritos cr
        where cr.convocatoria_id = p_convocatoria_id
          and cr.candidato_id = c.candidato_id
      )
      and not exists (
        select 1 from public.cruces_fuentes_meritos cr
        where cr.convocatoria_id = p_convocatoria_id
          and cr.fuente_meritos_id = f.fuente_id
      )
  ) p
  where p.comunes >= 2;

  create temporary table tmp_match_scores on commit drop as
  select
    p.*,
    cardinality(p.c_tokens) as c_n,
    cardinality(p.f_tokens) as f_n,
    p.comunes::numeric / nullif(greatest(cardinality(p.c_tokens), cardinality(p.f_tokens)), 0) as token_score,
    baremia.similitud_trigramas_nombre(p.nombre, p.nombre_publicado) as trigram_score
  from tmp_match_pairs p;

  create temporary table tmp_match_ranked_c on commit drop as
  select
    s.*,
    greatest(s.token_score, s.trigram_score) as score,
    row_number() over (
      partition by s.candidato_id
      order by greatest(s.token_score, s.trigram_score) desc,
               s.comunes desc,
               s.fuente_id
    ) as rn_c,
    lead(greatest(s.token_score, s.trigram_score)) over (
      partition by s.candidato_id
      order by greatest(s.token_score, s.trigram_score) desc,
               s.comunes desc,
               s.fuente_id
    ) as segundo_c
  from tmp_match_scores s;

  create temporary table tmp_match_ranked_f on commit drop as
  select
    r.*,
    row_number() over (
      partition by r.fuente_id
      order by r.score desc, r.comunes desc, r.candidato_id
    ) as rn_f,
    lead(r.score) over (
      partition by r.fuente_id
      order by r.score desc, r.comunes desc, r.candidato_id
    ) as segundo_f
  from tmp_match_ranked_c r
  where r.rn_c = 1;

  insert into public.cruces_fuentes_meritos (
    convocatoria_id,
    candidato_id,
    fuente_meritos_id,
    metodo,
    confianza,
    score_nombre,
    identificador_confirmado,
    datos_match
  )
  select
    p_convocatoria_id,
    r.candidato_id,
    r.fuente_id,
    'nombre_aproximado_dni_enmascarado',
    round(
      least(
        0.97::numeric,
        greatest(
          0.90::numeric,
          0.90::numeric + ((r.score - 0.86::numeric) / 0.14::numeric) * 0.07::numeric
        )
      ),
      3
    ),
    round(r.score, 4),
    true,
    jsonb_build_object(
      'version', 2,
      'regla_identificador', case
        when r.patron_ope = '***####**' then 'solapamiento_3_digitos'
        when r.patron_ope = '****####*' then 'bloque_4_digitos'
        else 'desconocida'
      end,
      'score_nombre', round(r.score, 4),
      'score_tokens', round(r.token_score, 4),
      'score_trigramas', round(r.trigram_score, 4),
      'tokens_comunes', r.comunes,
      'segundo_mejor_candidato', round(coalesce(r.segundo_c, 0), 4),
      'segundo_mejor_fuente', round(coalesce(r.segundo_f, 0), 4)
    )
  from tmp_match_ranked_f r
  where r.rn_f = 1
    and r.score >= 0.86
    and r.comunes >= 2
    and r.score - coalesce(r.segundo_c, 0) >= 0.15
    and r.score - coalesce(r.segundo_f, 0) >= 0.10;

  select count(*) into v_candidatos
  from public.candidatos
  where convocatoria_id = p_convocatoria_id;

  select count(*) into v_fuentes
  from public.fuentes_meritos
  where convocatoria_id = p_convocatoria_id;

  select count(*) into v_cruces
  from public.cruces_fuentes_meritos
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
    rl.id as registro_id,
    rl.puntuacion_oposicion,
    coalesce(rl.orden_publicado, 999999) as orden_oposicion,
    coalesce((rl.datos_extra->>'cupo_discapacidad')::boolean, false) as cupo_discapacidad,
    fm.puntuacion_formacion as formacion_bolsa,
    fm.puntuacion_experiencia as experiencia_bolsa,
    fm.puntuacion_total as total_bolsa,
    (cr.id is not null) as coincidencia_directa,
    cr.metodo as metodo_cruce,
    cr.confianza as confianza_cruce,
    cr.score_nombre,
    cr.identificador_confirmado,
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
      (
        select percentile_cont(0.5) within group (order by merito_directo)
        from tmp_baremia_meritos where merito_directo is not null
      ),
      0
    )::numeric(8,3) as meritos_estimados,
    case when m.coincidencia_directa then 'media' else 'baja' end as nivel_confianza,
    case
      when m.metodo_cruce = 'nombre_aproximado_dni_enmascarado' then 350
      when m.coincidencia_directa then 250
      else 700
    end as amplitud
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
      when r.metodo_cruce = 'nombre_exacto_dni_enmascarado' then
        'Estimación v1 basada en la nota oficial de oposición y una coincidencia de identidad confirmada por nombre y fragmento compatible del documento publicado en la bolsa de Enfermería. Los méritos de bolsa se han adaptado al máximo de 50 puntos de la convocatoria.'
      when r.metodo_cruce = 'nombre_aproximado_dni_enmascarado' then
        'Estimación v1 basada en la nota oficial de oposición y una coincidencia de identidad de alta similitud, confirmada además por fragmento compatible del documento publicado en la bolsa de Enfermería. Se amplía el intervalo por la variación del nombre entre fuentes.'
      else
        'Estimación v1 basada en la nota oficial de oposición y la mediana de méritos de candidatos comparables. No se encontró una coincidencia de identidad suficientemente segura en la bolsa; la incertidumbre es mayor.'
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
      'modelo', 'madrid-enfermeria-v1',
      'cruce_version', 2,
      'cupo', case when r.cupo_discapacidad then 'discapacidad' else 'general' end,
      'plazas_aplicables', case when r.cupo_discapacidad then p_plazas_discapacidad else p_plazas_general end,
      'coincidencia_bolsa', r.coincidencia_directa,
      'metodo_cruce', r.metodo_cruce,
      'confianza_cruce', r.confianza_cruce,
      'score_nombre', r.score_nombre,
      'identificador_confirmado', r.identificador_confirmado,
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

grant execute on function baremia.dni_publicado_compatible(text, text) to service_role;
grant execute on function baremia.nombre_tokens(text) to service_role;
grant execute on function baremia.similitud_trigramas_nombre(text, text) to service_role;
grant execute on function baremia.recalcular_cruces_meritos(uuid) to service_role;
grant execute on function baremia.generar_estimaciones_v1(uuid, integer, integer) to service_role;
