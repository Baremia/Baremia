create table if not exists public.baremos_convocatoria (
  id uuid primary key default gen_random_uuid(),
  convocatoria_id uuid not null references public.convocatorias(id) on delete cascade,
  version text not null,
  estado text not null default 'vigente' check (estado in ('vigente','historico','borrador')),
  fecha_publicacion date,
  fuente_url text,
  documento_listado_id uuid references public.listados(id) on delete set null,
  max_oposicion numeric not null,
  max_concurso numeric not null,
  max_experiencia numeric not null,
  max_formacion_otras numeric not null,
  reglas jsonb not null default '{}'::jsonb,
  correcciones jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (convocatoria_id, version)
);

create index if not exists idx_baremos_convocatoria_convocatoria
  on public.baremos_convocatoria(convocatoria_id, estado);

alter table public.baremos_convocatoria enable row level security;
revoke all on table public.baremos_convocatoria from anon, authenticated;
grant all on table public.baremos_convocatoria to service_role;

with objetivo as (
  select convocatoria_id
  from public.listados
  where titulo = 'rrhh-20260720-listado_def_aprobado_enfermeria_2025_puntuacion.pdf'
  limit 1
)
update public.listados l
set fecha_publicacion = date '2026-07-20',
    url_oficial = 'https://sede.comunidad.madrid/oferta-empleo/enfermeria-1',
    fuente_url = 'https://sede.comunidad.madrid/oferta-empleo/enfermeria-1'
from objetivo o
where l.convocatoria_id=o.convocatoria_id
  and l.titulo='rrhh-20260720-listado_def_aprobado_enfermeria_2025_puntuacion.pdf';

with objetivo as (
  select convocatoria_id
  from public.listados
  where titulo = 'rrhh-20260720-listado_def_aprobado_enfermeria_2025_puntuacion.pdf'
  limit 1
)
update public.listados l
set fecha_publicacion = date '2025-07-31',
    url_oficial = 'https://www.bocm.es/boletin/CM_Orden_BOCM/2025/07/31/BOCM-20250731-8.PDF',
    fuente_url = 'https://sede.comunidad.madrid/oferta-empleo/enfermeria-1'
from objetivo o
where l.convocatoria_id=o.convocatoria_id
  and l.titulo='bases1.pdf';

with objetivo as (
  select convocatoria_id
  from public.listados
  where titulo = 'rrhh-20260720-listado_def_aprobado_enfermeria_2025_puntuacion.pdf'
  limit 1
), bases as (
  select l.id, l.convocatoria_id
  from public.listados l join objetivo o on o.convocatoria_id=l.convocatoria_id
  where l.titulo='bases1.pdf'
  limit 1
)
update public.listados l
set fecha_publicacion = date '2025-08-26',
    url_oficial = 'https://www.bocm.es/boletin/CM_Orden_BOCM/2025/08/26/BOCM-20250826-11.PDF',
    fuente_url = 'https://sede.comunidad.madrid/oferta-empleo/enfermeria-1',
    documento_corregido_id = b.id
from bases b
where l.convocatoria_id=b.convocatoria_id
  and l.titulo='bases 2.pdf';

with objetivo as (
  select convocatoria_id
  from public.listados
  where titulo = 'rrhh-20260720-listado_def_aprobado_enfermeria_2025_puntuacion.pdf'
  limit 1
)
update public.listados l
set fecha_publicacion = date '2025-09-15',
    fecha_corte = date '2024-09-30',
    url_oficial = 'https://sede.comunidad.madrid/oferta-empleo/bolsa-unica-enfermeria',
    fuente_url = 'https://sede.comunidad.madrid/oferta-empleo/bolsa-unica-enfermeria'
from objetivo o
where l.convocatoria_id=o.convocatoria_id
  and l.titulo='enfermeria_definitivo_alfabetico.pdf';

with objetivo as (
  select convocatoria_id
  from public.listados
  where titulo = 'rrhh-20260720-listado_def_aprobado_enfermeria_2025_puntuacion.pdf'
  limit 1
), bases as (
  select l.id, l.convocatoria_id
  from public.listados l join objetivo o on o.convocatoria_id=l.convocatoria_id
  where l.titulo='bases1.pdf'
  limit 1
)
insert into public.baremos_convocatoria (
  convocatoria_id, version, estado, fecha_publicacion, fuente_url,
  documento_listado_id, max_oposicion, max_concurso, max_experiencia,
  max_formacion_otras, reglas, correcciones
)
select
  b.convocatoria_id,
  '2025-07-31-corr-2025-08-26',
  'vigente',
  date '2025-07-31',
  'https://www.bocm.es/boletin/CM_Orden_BOCM/2025/07/31/BOCM-20250731-8.PDF',
  b.id,
  50, 50, 35, 15,
  jsonb_build_object(
    'sistema', 'concurso-oposicion',
    'oposicion', jsonb_build_object('max', 50, 'umbral_aprobado_sobre_10', 5),
    'concurso', jsonb_build_object(
      'max', 50,
      'experiencia', jsonb_build_object(
        'max', 35,
        'misma_categoria_sns_publico_por_dia', 0.006,
        'otras_administraciones_publicas_por_dia', 0.004,
        'privada_concertada_acreditada_por_dia', 0.003,
        'privada_sociosanitaria_por_dia', 0.002,
        'cooperacion_por_dia', 0.002,
        'alta_direccion_publica_por_dia', 0.004,
        'otra_categoria_sns_publico_por_dia', 0.002
      ),
      'formacion_otras', jsonb_build_object(
        'max', 15,
        'master_universitario_oficial_salud', 2,
        'master_propio_salud', 2,
        'titulo_propio_experto_especialista', 1,
        'doctorado_cursos_dea', 1,
        'doctor', 3,
        'doctor_cum_laude_extra', 0.4,
        'especialidad_enfermeria_por_titulo', 2,
        'especialidades_enfermeria_max', 4,
        'formacion_continuada_por_ects', 0.1,
        'formacion_continuada_por_cfc', 0.04,
        'formacion_transversal_max', 4
      )
    ),
    'desempate', jsonb_build_array(
      'cupo_discapacidad',
      'mayor_puntuacion_oposicion',
      'apartados_baremo_por_orden',
      'letra_inicial_primer_apellido_U'
    )
  ),
  jsonb_build_array(
    jsonb_build_object(
      'fecha', '2025-08-26',
      'fuente', 'https://www.bocm.es/boletin/CM_Orden_BOCM/2025/08/26/BOCM-20250826-11.PDF',
      'detalle', 'En docencia 2.2.d, la referencia correcta es únicamente al apartado 2.1.2.b.'
    )
  )
from bases b
on conflict (convocatoria_id, version) do update
set estado=excluded.estado,
    fecha_publicacion=excluded.fecha_publicacion,
    fuente_url=excluded.fuente_url,
    documento_listado_id=excluded.documento_listado_id,
    max_oposicion=excluded.max_oposicion,
    max_concurso=excluded.max_concurso,
    max_experiencia=excluded.max_experiencia,
    max_formacion_otras=excluded.max_formacion_otras,
    reglas=excluded.reglas,
    correcciones=excluded.correcciones,
    updated_at=now();
