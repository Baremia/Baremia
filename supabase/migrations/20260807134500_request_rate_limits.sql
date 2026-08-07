create table if not exists public.limites_solicitudes (
  clave text primary key,
  ventana_inicio timestamptz not null default now(),
  contador integer not null default 0,
  bloqueado_hasta timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.limites_solicitudes enable row level security;
revoke all on public.limites_solicitudes from anon, authenticated;
grant select, insert, update on public.limites_solicitudes to service_role;

create or replace function baremia.consumir_limite_solicitudes(
  p_clave text,
  p_limite integer,
  p_ventana_segundos integer,
  p_bloqueo_segundos integer default 0
) returns table(permitido boolean, restantes integer, reintentar_en_segundos integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_inicio timestamptz;
  v_contador integer;
  v_bloqueado timestamptz;
begin
  if trim(coalesce(p_clave,'')) = '' or p_limite < 1 or p_ventana_segundos < 1 then
    raise exception 'Configuración de límite no válida';
  end if;

  insert into public.limites_solicitudes(clave, ventana_inicio, contador, updated_at)
  values (p_clave, v_now, 0, v_now)
  on conflict (clave) do nothing;

  select ventana_inicio, contador, bloqueado_hasta
    into v_inicio, v_contador, v_bloqueado
  from public.limites_solicitudes
  where clave = p_clave
  for update;

  if v_bloqueado is not null and v_bloqueado > v_now then
    return query select false, 0,
      greatest(1, ceil(extract(epoch from (v_bloqueado-v_now)))::integer);
    return;
  end if;

  if v_inicio <= v_now - make_interval(secs => p_ventana_segundos) then
    v_inicio := v_now;
    v_contador := 0;
  end if;

  v_contador := v_contador + 1;

  update public.limites_solicitudes
  set ventana_inicio = v_inicio,
      contador = v_contador,
      bloqueado_hasta = case
        when v_contador > p_limite and p_bloqueo_segundos > 0
          then v_now + make_interval(secs => p_bloqueo_segundos)
        else null
      end,
      updated_at = v_now
  where clave = p_clave;

  if v_contador > p_limite then
    return query select false, 0,
      case
        when p_bloqueo_segundos > 0 then p_bloqueo_segundos
        else greatest(1, ceil(extract(epoch from ((v_inicio + make_interval(secs => p_ventana_segundos))-v_now)))::integer)
      end;
  else
    return query select true, greatest(0,p_limite-v_contador), 0;
  end if;
end;
$$;

revoke execute on function baremia.consumir_limite_solicitudes(text,integer,integer,integer) from public, anon, authenticated;
grant execute on function baremia.consumir_limite_solicitudes(text,integer,integer,integer) to service_role;
