alter table public.listados
  drop constraint if exists listados_tipo_check;

alter table public.listados
  add constraint listados_tipo_check
  check (tipo = any (array[
    'convocatoria_bases'::text,
    'correccion_bases'::text,
    'admitidos_excluidos'::text,
    'resultado_oposicion'::text,
    'baremo_meritos'::text,
    'meritos_provisionales'::text,
    'meritos_definitivos'::text,
    'bolsa_empleo'::text,
    'relacion_final'::text,
    'adjudicacion_nombramiento'::text,
    'calibracion_historica'::text,
    'otro_documento_oficial'::text
  ]));

create table if not exists public.fuentes_calibracion_historica (
  id uuid primary key default gen_random_uuid(),
  listado_id uuid not null references public.listados(id) on delete cascade,
  convocatoria_objetivo_id uuid not null references public.convocatorias(id) on delete cascade,
  proceso_fuente text not null,
  ano_proceso integer not null,
  numero_orden integer,
  dni_publicado text,
  dni_normalizado text,
  nombre_publicado text not null,
  nombre_normalizado text not null,
  cupo_discapacidad boolean not null default false,
  puntuacion_experiencia_real numeric,
  puntuacion_formacion_real numeric,
  puntuacion_total_concurso numeric,
  numero_pagina integer not null,
  numero_fila integer not null,
  datos_extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (listado_id, numero_pagina, numero_fila)
);

create index if not exists idx_calibracion_historica_listado
  on public.fuentes_calibracion_historica (listado_id);
create index if not exists idx_calibracion_historica_convocatoria
  on public.fuentes_calibracion_historica (convocatoria_objetivo_id);
create index if not exists idx_calibracion_historica_nombre
  on public.fuentes_calibracion_historica (convocatoria_objetivo_id, nombre_normalizado);
create index if not exists idx_calibracion_historica_dni
  on public.fuentes_calibracion_historica (convocatoria_objetivo_id, dni_normalizado);

alter table public.fuentes_calibracion_historica enable row level security;
revoke all on table public.fuentes_calibracion_historica from anon, authenticated;
grant select, insert, update, delete on table public.fuentes_calibracion_historica to service_role;
