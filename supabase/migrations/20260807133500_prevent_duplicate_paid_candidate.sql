create unique index if not exists pagos_un_confirmado_por_candidato
  on public.pagos(candidato_id)
  where estado = 'pagado';
