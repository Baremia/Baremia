create or replace function baremia.buscar_candidato(
  p_convocatoria_id uuid,
  p_busqueda text
)
returns table(
  candidato_id uuid,
  nombre text,
  dni_mostrado text,
  convocatoria_id uuid,
  convocatoria text,
  estado_convocatoria text
)
language sql
security definer
set search_path = ''
as $$
  with parametros as (
    select
      baremia.tokens_nombre(p_busqueda) as tokens_buscados,
      baremia.firma_nombre(p_busqueda) as firma_buscada,
      baremia.normalizar_identidad(p_busqueda) as identidad_buscada
  ),
  candidatos_base as (
    select
      c.id,
      c.nombre,
      c.convocatoria_id,
      cv.nombre as convocatoria,
      to_jsonb(cv) ->> 'estado' as estado_convocatoria,
      coalesce(c.dni, registro.dni_publicado, '') as dni_publicado,
      baremia.tokens_nombre(c.nombre) as tokens_candidato,
      baremia.firma_nombre(c.nombre) as firma_candidato,
      baremia.normalizar_identidad(coalesce(c.dni, registro.dni_publicado, '')) as dni_busqueda
    from public.candidatos c
    inner join public.convocatorias cv
      on cv.id = c.convocatoria_id
    left join lateral (
      select rl.dni_publicado
      from public.registros_listado rl
      where rl.candidato_id = c.id
        and rl.dni_publicado is not null
        and trim(rl.dni_publicado) <> ''
      order by rl.created_at desc
      limit 1
    ) registro on true
    where c.convocatoria_id = p_convocatoria_id
  )
  select
    cb.id as candidato_id,
    cb.nombre,
    case
      when cb.dni_publicado like '%*%'
        then cb.dni_publicado
      when length(trim(cb.dni_publicado)) >= 4
        then '***' || right(trim(cb.dni_publicado), 4)
      else '***'
    end as dni_mostrado,
    cb.convocatoria_id,
    cb.convocatoria,
    cb.estado_convocatoria
  from candidatos_base cb
  cross join parametros p
  where
    (
      p.identidad_buscada <> ''
      and cb.dni_busqueda = p.identidad_buscada
    )
    or
    (
      cardinality(p.tokens_buscados) > 0
      and p.tokens_buscados <@ cb.tokens_candidato
    )
  order by
    case
      when cb.dni_busqueda = p.identidad_buscada then 0
      when cb.firma_candidato = p.firma_buscada then 1
      else 2
    end,
    greatest(cardinality(cb.tokens_candidato) - cardinality(p.tokens_buscados), 0),
    cb.nombre,
    cb.id
  limit 30;
$$;

grant execute on function baremia.buscar_candidato(uuid, text) to service_role;
