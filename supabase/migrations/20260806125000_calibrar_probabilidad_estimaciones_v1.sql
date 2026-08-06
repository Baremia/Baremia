create or replace function baremia.calibrar_probabilidad_estimacion_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.metodologia_version = 'madrid-enfermeria-v1'
     and new.probabilidad_plaza is not null then
    new.probabilidad_plaza := case
      when new.nivel_confianza = 'baja' then least(new.probabilidad_plaza, 80::numeric)
      when new.nivel_confianza = 'media' then least(new.probabilidad_plaza, 95::numeric)
      else least(new.probabilidad_plaza, 98::numeric)
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_calibrar_probabilidad_estimacion_v1
on public.estimaciones;

create trigger trg_calibrar_probabilidad_estimacion_v1
before insert or update of probabilidad_plaza, nivel_confianza, metodologia_version
on public.estimaciones
for each row
execute function baremia.calibrar_probabilidad_estimacion_v1();

update public.estimaciones
set probabilidad_plaza = case
  when nivel_confianza = 'baja' then least(probabilidad_plaza, 80::numeric)
  when nivel_confianza = 'media' then least(probabilidad_plaza, 95::numeric)
  else least(probabilidad_plaza, 98::numeric)
end
where metodologia_version = 'madrid-enfermeria-v1'
  and probabilidad_plaza is not null;
