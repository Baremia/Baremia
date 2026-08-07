alter table public.pagos
  add column if not exists email_cliente text,
  add column if not exists checkout_session_id text,
  add column if not exists payment_intent_id text,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists pagos_checkout_session_unique
  on public.pagos(checkout_session_id)
  where checkout_session_id is not null;
create index if not exists pagos_payment_intent_idx
  on public.pagos(payment_intent_id)
  where payment_intent_id is not null;

create table if not exists public.eventos_pago (
  id uuid primary key default gen_random_uuid(),
  proveedor text not null,
  evento_proveedor_id text not null,
  tipo_evento text not null,
  referencia_pago text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','procesado','ignorado','error')),
  error text,
  procesado_at timestamptz,
  created_at timestamptz not null default now(),
  unique(proveedor, evento_proveedor_id)
);

create table if not exists public.entregas_acceso (
  id uuid primary key default gen_random_uuid(),
  pago_id uuid not null unique references public.pagos(id) on delete cascade,
  acceso_id uuid not null references public.accesos(id) on delete cascade,
  candidato_id uuid not null references public.candidatos(id) on delete cascade,
  email_destino text not null,
  codigo_cifrado text not null,
  cifrado_iv text not null,
  cifrado_auth_tag text not null,
  algoritmo text not null default 'aes-256-gcm',
  estado text not null default 'pendiente'
    check (estado in ('pendiente','enviando','enviado','error','cancelado')),
  proveedor_email text,
  referencia_email text,
  intentos integer not null default 0,
  ultimo_error text,
  ultimo_intento_at timestamptz,
  enviado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists eventos_pago_estado_idx on public.eventos_pago(estado, created_at);
create index if not exists entregas_acceso_estado_idx on public.entregas_acceso(estado, created_at);
create index if not exists entregas_acceso_candidato_idx on public.entregas_acceso(candidato_id);

alter table public.eventos_pago enable row level security;
alter table public.entregas_acceso enable row level security;
revoke all on public.eventos_pago from anon, authenticated;
revoke all on public.entregas_acceso from anon, authenticated;
grant select, insert, update on public.eventos_pago to service_role;
grant select, insert, update on public.entregas_acceso to service_role;

create or replace function baremia.registrar_pago_confirmado_con_entrega(
  p_candidato_id uuid,
  p_proveedor text,
  p_referencia_proveedor text,
  p_importe numeric,
  p_moneda text,
  p_codigo_acceso text,
  p_codigo_cifrado text,
  p_cifrado_iv text,
  p_cifrado_auth_tag text,
  p_email_destino text,
  p_checkout_session_id text default null,
  p_payment_intent_id text default null
) returns table(
  pago_id uuid,
  acceso_id uuid,
  ya_procesado boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pago_id uuid;
  v_acceso_id uuid;
  v_codigo_hash text;
  v_proveedor text := lower(trim(coalesce(p_proveedor,'')));
  v_referencia text := trim(coalesce(p_referencia_proveedor,''));
  v_moneda text := upper(trim(coalesce(p_moneda,'EUR')));
  v_email text := lower(trim(coalesce(p_email_destino,'')));
begin
  if not exists (select 1 from public.candidatos where id = p_candidato_id) then
    raise exception 'El candidato indicado no existe';
  end if;
  if v_proveedor = '' or v_referencia = '' then
    raise exception 'Proveedor y referencia de pago son obligatorios';
  end if;
  if p_importe is null or p_importe <= 0 then
    raise exception 'El importe debe ser superior a cero';
  end if;
  if v_moneda !~ '^[A-Z]{3}$' then
    raise exception 'La moneda debe tener un código ISO de tres letras';
  end if;
  if v_email = '' or position('@' in v_email) < 2 then
    raise exception 'El correo de entrega no es válido';
  end if;

  select p.id, p.acceso_id
    into v_pago_id, v_acceso_id
  from public.pagos p
  where p.referencia_proveedor = v_referencia
  limit 1;

  if v_pago_id is not null then
    return query select v_pago_id, v_acceso_id, true;
    return;
  end if;

  if exists (
    select 1 from public.pagos p
    where p.candidato_id = p_candidato_id and p.estado = 'pagado'
  ) then
    raise exception 'Este candidato ya dispone de un acceso pagado';
  end if;

  if upper(trim(coalesce(p_codigo_acceso,''))) !~ '^BRM-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$' then
    raise exception 'Formato de código de acceso no válido';
  end if;
  if trim(coalesce(p_codigo_cifrado,'')) = ''
     or trim(coalesce(p_cifrado_iv,'')) = ''
     or trim(coalesce(p_cifrado_auth_tag,'')) = '' then
    raise exception 'Faltan los datos cifrados necesarios para la entrega';
  end if;

  v_codigo_hash := extensions.crypt(
    upper(trim(p_codigo_acceso)),
    extensions.gen_salt('bf', 10)
  );

  insert into public.accesos(candidato_id,codigo_hash,estado)
  values(p_candidato_id,v_codigo_hash,'activo')
  returning id into v_acceso_id;

  insert into public.pagos(
    candidato_id, acceso_id, proveedor, referencia_proveedor,
    estado, importe, moneda, fecha_pago, email_cliente,
    checkout_session_id, payment_intent_id
  ) values (
    p_candidato_id, v_acceso_id, v_proveedor, v_referencia,
    'pagado', p_importe, v_moneda, now(), v_email,
    nullif(trim(coalesce(p_checkout_session_id,'')),''),
    nullif(trim(coalesce(p_payment_intent_id,'')),'')
  ) returning id into v_pago_id;

  insert into public.entregas_acceso(
    pago_id, acceso_id, candidato_id, email_destino,
    codigo_cifrado, cifrado_iv, cifrado_auth_tag, estado
  ) values (
    v_pago_id, v_acceso_id, p_candidato_id, v_email,
    p_codigo_cifrado, p_cifrado_iv, p_cifrado_auth_tag, 'pendiente'
  );

  return query select v_pago_id, v_acceso_id, false;
end;
$$;

revoke execute on function baremia.registrar_pago_confirmado_con_entrega(uuid,text,text,numeric,text,text,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function baremia.registrar_pago_confirmado_con_entrega(uuid,text,text,numeric,text,text,text,text,text,text,text,text) to service_role;
