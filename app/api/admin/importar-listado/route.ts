import { NextRequest, NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-auth";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BUCKET = "listados-oficiales";
const BATCH_SIZE = 500;

type RegistroProcesado = {
  numero_registro?: unknown;
  nombre_publicado?: unknown;
  dni_publicado?: unknown;
  puntuacion_oposicion?: unknown;
  puntuacion_concurso?: unknown;
  puntuacion_total?: unknown;
  orden_publicado?: unknown;
  observaciones?: unknown;
  numero_pagina?: unknown;
  numero_fila?: unknown;
  cupo_discapacidad?: unknown;
  datos_extra?: unknown;
};

type ResultadoProcesado = {
  version?: unknown;
  listado_id?: unknown;
  convocatoria_id?: unknown;
  extraccion?: {
    formato?: unknown;
    registros?: unknown;
    total_esperado?: unknown;
    total_coincide?: unknown;
  };
};

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "Sesión de administrador no válida." },
    { status: 401 }
  );
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function dniFragment(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : digits;
}

function validateOpposition(records: RegistroProcesado[]) {
  const errors: string[] = [];
  const registrations = new Set<string>();

  records.forEach((record, index) => {
    const registration = text(record.numero_registro);
    const name = text(record.nombre_publicado);
    const order = Number(record.orden_publicado);

    if (!registration) errors.push(`Fila ${index + 1}: falta numero_registro.`);
    if (!name) errors.push(`Fila ${index + 1}: falta nombre_publicado.`);
    if (!Number.isInteger(order) || order !== index + 1) {
      errors.push(`Fila ${index + 1}: orden_publicado no es consecutivo.`);
    }
    if (registration && registrations.has(registration)) {
      errors.push(`Número de registro duplicado: ${registration}.`);
    }
    registrations.add(registration);
  });

  return errors.slice(0, 20);
}

export async function POST(request: NextRequest) {
  if (!(await hasAdminSession())) return unauthorized();

  let listadoId = "";
  try {
    const body = await request.json();
    listadoId = text(body?.listado_id);
  } catch {
    return NextResponse.json({ ok: false, error: "Solicitud no válida." }, { status: 400 });
  }

  if (!listadoId) {
    return NextResponse.json(
      { ok: false, error: "Falta el identificador del listado." },
      { status: 400 }
    );
  }

  const { data: listado, error: listadoError } = await supabaseAdmin
    .from("listados")
    .select("id,convocatoria_id,titulo,tipo,estado_procesamiento")
    .eq("id", listadoId)
    .single();

  if (listadoError || !listado) {
    return NextResponse.json({ ok: false, error: "El listado no existe." }, { status: 404 });
  }

  if (listado.tipo === "baremo_meritos" || listado.tipo === "bolsa_empleo") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Esta fuente de méritos se procesa por lotes y no se puede importar como candidatos.",
      },
      { status: 409 }
    );
  }

  const { data: proceso, error: procesoError } = await supabaseAdmin
    .from("procesos_ia")
    .select("id,detalles")
    .eq("listado_id", listadoId)
    .eq("estado", "completado")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (procesoError || !proceso) {
    return NextResponse.json(
      { ok: false, error: "No existe un procesamiento completado para este listado." },
      { status: 409 }
    );
  }

  const details =
    proceso.detalles && typeof proceso.detalles === "object"
      ? (proceso.detalles as Record<string, unknown>)
      : {};
  const processedPath = text(details.ruta_procesada);

  if (!processedPath) {
    return NextResponse.json(
      { ok: false, error: "El proceso no contiene la ruta del JSON procesado." },
      { status: 409 }
    );
  }

  const { data: file, error: downloadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .download(processedPath);

  if (downloadError || !file) {
    return NextResponse.json(
      {
        ok: false,
        error: "No se pudo descargar el resultado procesado.",
        detalle: downloadError?.message,
      },
      { status: 500 }
    );
  }

  let parsed: ResultadoProcesado;
  try {
    parsed = JSON.parse(await file.text()) as ResultadoProcesado;
  } catch {
    return NextResponse.json(
      { ok: false, error: "El resultado procesado no contiene un JSON válido." },
      { status: 422 }
    );
  }

  if (parsed.version !== "baremia-parser-v2") {
    return NextResponse.json(
      { ok: false, error: "Reprocesa el PDF antes de importarlo." },
      { status: 409 }
    );
  }

  if (parsed.listado_id !== listado.id || parsed.convocatoria_id !== listado.convocatoria_id) {
    return NextResponse.json(
      { ok: false, error: "El JSON procesado no corresponde con este listado." },
      { status: 422 }
    );
  }

  const records = Array.isArray(parsed.extraccion?.registros)
    ? (parsed.extraccion?.registros as RegistroProcesado[])
    : [];
  const format = text(parsed.extraccion?.formato);

  if (records.length === 0) {
    return NextResponse.json(
      { ok: false, error: "El resultado no contiene registros para importar." },
      { status: 422 }
    );
  }

  if (format === "madrid_bolsa_alfabetica") {
    const { error: deleteReferenceError } = await supabaseAdmin
      .from("meritos_referencia")
      .delete()
      .eq("listado_id", listadoId);

    if (deleteReferenceError) {
      return NextResponse.json(
        { ok: false, error: "No se pudieron preparar los méritos existentes.", detalle: deleteReferenceError.message },
        { status: 500 }
      );
    }

    let imported = 0;
    for (let start = 0; start < records.length; start += BATCH_SIZE) {
      const rows = records.slice(start, start + BATCH_SIZE).map((record) => {
        const extra =
          record.datos_extra && typeof record.datos_extra === "object"
            ? (record.datos_extra as Record<string, unknown>)
            : {};
        const name = text(record.nombre_publicado);
        const dni = text(record.dni_publicado);
        return {
          convocatoria_id: listado.convocatoria_id,
          listado_id: listadoId,
          nombre_publicado: name,
          nombre_normalizado: normalizeName(name),
          dni_publicado: dni || null,
          dni_fragmento: dniFragment(dni) || null,
          formacion_bolsa: numberOrNull(extra.formacion),
          experiencia_bolsa: numberOrNull(extra.experiencia),
          total_bolsa: numberOrNull(record.puntuacion_total),
          fecha_corte: "2024-09-30",
        };
      });

      const { error } = await supabaseAdmin.from("meritos_referencia").insert(rows);
      if (error) {
        return NextResponse.json(
          {
            ok: false,
            error: "La importación de méritos se interrumpió.",
            detalle: error.message,
            registros_importados: imported,
          },
          { status: 500 }
        );
      }
      imported += rows.length;
    }

    await Promise.all([
      supabaseAdmin.from("listados").update({ total_registros: imported }).eq("id", listadoId),
      supabaseAdmin
        .from("procesos_ia")
        .update({
          detalles: {
            ...details,
            importacion: {
              estado: "completada",
              tipo: "meritos_referencia",
              importado_at: new Date().toISOString(),
              registros_importados: imported,
            },
          },
        })
        .eq("id", proceso.id),
    ]);

    return NextResponse.json({
      ok: true,
      tipo_importacion: "meritos_referencia",
      registros_importados: imported,
      mensaje: `${imported} registros de bolsa importados como referencia de méritos.`,
    });
  }

  const expectedTotal = Number(parsed.extraccion?.total_esperado);
  const totalMatches = parsed.extraccion?.total_coincide === true;

  if (!Number.isInteger(expectedTotal) || expectedTotal <= 0 || !totalMatches) {
    return NextResponse.json(
      {
        ok: false,
        error: "La extracción no coincide con el total declarado en el PDF.",
        detalle: `Extraídos: ${records.length}. Total declarado: ${Number.isFinite(expectedTotal) ? expectedTotal : "no detectado"}.`,
      },
      { status: 422 }
    );
  }

  const validationErrors = validateOpposition(records);
  if (validationErrors.length > 0) {
    return NextResponse.json(
      { ok: false, error: "La validación automática ha detectado registros incorrectos.", detalle: validationErrors },
      { status: 422 }
    );
  }

  const { error: deleteError } = await supabaseAdmin
    .from("registros_listado")
    .delete()
    .eq("listado_id", listadoId);

  if (deleteError) {
    return NextResponse.json(
      { ok: false, error: "No se pudieron preparar los registros existentes.", detalle: deleteError.message },
      { status: 500 }
    );
  }

  let imported = 0;
  for (let start = 0; start < records.length; start += BATCH_SIZE) {
    const batch = records.slice(start, start + BATCH_SIZE);
    const { data, error } = await supabaseAdmin
      .schema("baremia")
      .rpc("importar_lote_registros_listado", {
        p_listado_id: listadoId,
        p_registros: batch,
      });

    if (error) {
      return NextResponse.json(
        { ok: false, error: "La importación se interrumpió.", detalle: error.message, registros_importados: imported },
        { status: 500 }
      );
    }
    const result = Array.isArray(data) ? data[0] : data;
    imported += Number(result?.registros_procesados ?? batch.length);
  }

  await Promise.all([
    supabaseAdmin.from("listados").update({ total_registros: imported, error_procesamiento: null }).eq("id", listadoId),
    supabaseAdmin
      .from("procesos_ia")
      .update({
        detalles: {
          ...details,
          importacion: {
            estado: "completada",
            tipo: "oposicion",
            importado_at: new Date().toISOString(),
            registros_importados: imported,
          },
        },
      })
      .eq("id", proceso.id),
  ]);

  return NextResponse.json({
    ok: true,
    tipo_importacion: "oposicion",
    registros_importados: imported,
    mensaje: `${imported} candidatos y registros importados correctamente.`,
  });
}
