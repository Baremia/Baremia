create or replace function baremia.buscar_accesos_admin(
  p_busqueda text,
  p_limite integer default 30
)
returns table(
  candidato_id uuid,
  nombre text,
  dni_mostrado text,
  convocatoria_id uuid,
  convocatoria text,
  acceso_id uuid,
  acceso_estado text,
  acceso_creado_at timestamptz,
  ultimo_acceso_at timestamptz,
  intentos_fallidos integer,
  bloqueado_hasta timestamptz,
  pago_estado text,
  pago_importe numeric,
  pago_moneda text,
  fecha_pago timestamptz,
  sesiones_activas integer,
  tiene_estimacion boolean
)
language sql
security definer
set search_path = ''
as $$
  with candidatos_filtrados as (
    select c.*
    from public.candidatos c
    where length(trim(coalesce(p_busqueda, ''))) >= 2
      and (
        c.nombre ilike '%' || trim(p_busqueda) || '%'
        or coalesce(c.dni, '') ilike '%' || trim(p_busqueda) || '%'
        or coalesce(c.numero_registro, '') ilike '%' || trim(p_busqueda) || '%'
        or exists (
          select 1
          from public.registros_listado rl_busqueda
          where rl_busqueda.candidato_id = c.id
            and coalesce(rl_busqueda.dni_publicado, '') ilike '%' || trim(p_busqueda) || '%'
        )
      )
    order by c.nombre
    limit least(greatest(coalesce(p_limite, 30), 1), 100)
  )
  select
    c.id,
    c.nombre,
    coalesce(c.dni, registro.dni_publicado, '***') as dni_mostrado,
    c.convocatoria_id,
    conv.nombre as convocatoria,
    acceso.id as acceso_id,
    acceso.estado as acceso_estado,
    acceso.created_at as acceso_creado_at,
    acceso.ultimo_acceso_at,
    coalesce(acceso.intentos_fallidos, 0),
    acceso.bloqueado_hasta,
    pago.estado as pago_estado,
    pago.importe as pago_importe,
    pago.moneda as pago_moneda,
    pago.fecha_pago,
    coalesce(sesiones.total, 0)::integer as sesiones_activas,
    exists (
      select 1
      from public.estimaciones e
      where e.candidato_id = c.id
    ) as tiene_estimacion
  from candidatos_filtrados c
  join public.convocatorias conv on conv.id = c.convocatoria_id
  left join lateral (
    select rl.dni_publicado
    from public.registros_listado rl
    where rl.candidato_id = c.id
      and rl.dni_publicado is not null
      and rl.dni_publicado <> ''
    order by rl.created_at desc
    limit 1
  ) registro on true
  left join lateral (
    select a.*
    from public.accesos a
    where a.candidato_id = c.id
    order by a.created_at desc
    limit 1
  ) acceso on true
  left join lateral (
    select p.*
    from public.pagos p
    where p.candidato_id = c.id
    order by coalesce(p.fecha_pago, p.created_at) desc
    limit 1
  ) pago on true
  left join lateral (
    select count(*) as total
    from public.sesiones s
    join public.accesos a_sesion on a_sesion.id = s.acceso_id
    where a_sesion.candidato_id = c.id
      and s.revocada_at is null
      and s.expira_at > now()
  ) sesiones on true;
$$;

create or replace function baremia.regenerar_codigo_acceso_admin(
  p_candidato_id uuid
)
returns table(
  acceso_id uuid,
  codigo_acceso text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acceso_id uuid;
  v_codigo text;
  v_codigo_hash text;
  v_hex text;
begin
  if not exists (
    select 1
    from public.candidatos c
    where c.id = p_candidato_id
  ) then
    raise exception 'El candidato indicado no existe';
  end if;

  select a.id
  into v_acceso_id
  from public.accesos a
  where a.candidato_id = p_candidato_id
  order by a.created_at desc
  limit 1
  for update;

  if v_acceso_id is null then
    raise exception 'El candidato todavía no dispone de un acceso. No se puede omitir el flujo de pago';
  end if;

  v_hex := upper(encode(extensions.gen_random_bytes(8), 'hex'));
  v_codigo :=
    'BRM-' || substr(v_hex, 1, 4) ||
    '-' || substr(v_hex, 5, 4) ||
    '-' || substr(v_hex, 9, 4) ||
    '-' || substr(v_hex, 13, 4);

  v_codigo_hash := extensions.crypt(
    v_codigo,
    extensions.gen_salt('bf', 10)
  );

  update public.accesos
  set estado = case when id = v_acceso_id then 'activo' else 'revocado' end,
      codigo_hash = case when id = v_acceso_id then v_codigo_hash else codigo_hash end,
      intentos_fallidos = case when id = v_acceso_id then 0 else intentos_fallidos end,
      ultimo_intento_at = case when id = v_acceso_id then null else ultimo_intento_at end,
      bloqueado_hasta = case when id = v_acceso_id then null else bloqueado_hasta end,
      motivo_bloqueo = case when id = v_acceso_id then null else motivo_bloqueo end
  where candidato_id = p_candidato_id;

  update public.sesiones s
  set revocada_at = coalesce(s.revocada_at, now())
  where s.acceso_id in (
    select a.id
    from public.accesos a
    where a.candidato_id = p_candidato_id
  )
    and s.revocada_at is null;

  return query select v_acceso_id, v_codigo;
end;
$$;

revoke all on function baremia.buscar_accesos_admin(text, integer) from public, anon, authenticated;
revoke all on function baremia.regenerar_codigo_acceso_admin(uuid) from public, anon, authenticated;
grant execute on function baremia.buscar_accesos_admin(text, integer) to service_role;
grant execute on function baremia.regenerar_codigo_acceso_admin(uuid) to service_role;
