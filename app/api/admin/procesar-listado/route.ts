import { NextRequest, NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-auth";
import { parseListadoText } from "../../../../lib/listado-parser";
import { extractPdfText } from "../../../../lib/pdf-processor";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET = "listados-oficiales";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Sesión de administrador no válida." }, { status: 401 });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error desconocido durante el procesamiento.";
}

async function updateProcess(
  processId: string,
  values: Record<string, unknown>
) {
  await supabaseAdmin.schema("baremia").from("procesos_ia").update(values).eq("id", processId);
}

export async function POST(request: NextRequest) {
  if (!(await hasAdminSession())) return unauthorized();

  let listadoId = "";
  try {
    const body = await request.json();
    listadoId = typeof body?.listado_id === "string" ? body.listado_id.trim() : "";
  } catch {
    return NextResponse.json({ ok: false, error: "Solicitud no válida." }, { status: 400 });
  }

  if (!listadoId) {
    return NextResponse.json({ ok: false, error: "Falta el identificador del listado." }, { status: 400 });
  }

  const { data: activeProcess } = await supabaseAdmin
    .schema("baremia")
    .from("procesos_ia")
    .select("id")
    .eq("listado_id", listadoId)
    .in("estado", ["pendiente", "ejecutando"])
    .maybeSingle();

  if (activeProcess) {
    return NextResponse.json({ ok: false, error: "Este listado ya tiene un proceso activo." }, { status: 409 });
  }

  const { data: listado, error: listadoError } = await supabaseAdmin
    .schema("baremia")
    .from("listados")
    .select("id,convocatoria_id,nombre_archivo,ruta_storage")
    .eq("id", listadoId)
    .single();

  if (listadoError || !listado?.ruta_storage) {
    return NextResponse.json({ ok: false, error: "Listado o archivo PDF no encontrado." }, { status: 404 });
  }

  const now = new Date().toISOString();
  const { data: proceso, error: processError } = await supabaseAdmin
    .schema("baremia")
    .from("procesos_ia")
    .insert({
      listado_id: listadoId,
      tipo: "extraccion_estructurada",
      estado: "ejecutando",
      progreso: 5,
      modelo_ia: "baremia-parser-v1",
      inicio_at: now,
      detalles: { fase: "descarga", archivo: listado.nombre_archivo },
    })
    .select("id")
    .single();

  if (processError || !proceso) {
    return NextResponse.json(
      { ok: false, error: "No se pudo iniciar el proceso.", detalle: processError?.message },
      { status: 500 }
    );
  }

  await supabaseAdmin.schema("baremia").from("listados").update({ estado: "procesando" }).eq("id", listadoId);

  try {
    const { data: file, error: downloadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .download(listado.ruta_storage);

    if (downloadError || !file) throw new Error(downloadError?.message || "No se pudo descargar el PDF.");

    await updateProcess(proceso.id, {
      progreso: 25,
      detalles: { fase: "extraccion_texto", archivo: listado.nombre_archivo },
    });

    const extracted = await extractPdfText(await file.arrayBuffer());
    if (extracted.requiresOcr) {
      throw new Error("El PDF parece escaneado o contiene muy poco texto. Necesitará OCR.");
    }

    await updateProcess(proceso.id, {
      progreso: 55,
      detalles: {
        fase: "interpretacion",
        paginas: extracted.totalPages,
        caracteres: extracted.characters,
      },
    });

    const parsed = parseListadoText(extracted.text);
    if (parsed.registros.length === 0) {
      throw new Error("Se extrajo texto, pero no se reconoció ningún aspirante. Revisa el formato del PDF.");
    }

    const processedPath = `procesados/${listado.convocatoria_id}/${listado.id}.json`;
    const payload = JSON.stringify(
      {
        version: "baremia-parser-v1",
        listado_id: listado.id,
        convocatoria_id: listado.convocatoria_id,
        nombre_archivo: listado.nombre_archivo,
        procesado_at: new Date().toISOString(),
        documento: {
          total_paginas: extracted.totalPages,
          caracteres: extracted.characters,
          lineas: extracted.lines,
        },
        extraccion: parsed,
      },
      null,
      2
    );

    await updateProcess(proceso.id, {
      progreso: 80,
      detalles: {
        fase: "guardado",
        formato: parsed.formato,
        registros_extraidos: parsed.registros.length,
      },
    });

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(processedPath, Buffer.from(payload, "utf8"), {
        contentType: "application/json; charset=utf-8",
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) throw new Error(`No se pudo guardar el resultado: ${uploadError.message}`);

    const finishedAt = new Date().toISOString();
    await Promise.all([
      updateProcess(proceso.id, {
        estado: "completado",
        progreso: 100,
        fin_at: finishedAt,
        error: null,
        detalles: {
          fase: "completado",
          ruta_procesada: processedPath,
          paginas: extracted.totalPages,
          caracteres: extracted.characters,
          lineas: extracted.lines,
          requiere_ocr: false,
          formato: parsed.formato,
          confianza: parsed.confianza,
          registros_extraidos: parsed.registros.length,
          duplicados_descartados: parsed.duplicados_descartados,
          avisos: parsed.avisos,
        },
      }),
      supabaseAdmin
        .schema("baremia")
        .from("listados")
        .update({ estado: "procesado", fecha_procesamiento: finishedAt, error_procesamiento: null })
        .eq("id", listadoId),
    ]);

    return NextResponse.json({
      ok: true,
      proceso_id: proceso.id,
      resultado: {
        paginas: extracted.totalPages,
        formato: parsed.formato,
        confianza: parsed.confianza,
        registros_extraidos: parsed.registros.length,
        duplicados_descartados: parsed.duplicados_descartados,
        ruta_procesada: processedPath,
        avisos: parsed.avisos,
      },
    });
  } catch (error) {
    const message = errorMessage(error);
    const finishedAt = new Date().toISOString();

    await Promise.all([
      updateProcess(proceso.id, {
        estado: "error",
        fin_at: finishedAt,
        error: message,
        detalles: { fase: "error" },
      }),
      supabaseAdmin
        .schema("baremia")
        .from("listados")
        .update({ estado: "error", error_procesamiento: message })
        .eq("id", listadoId),
    ]);

    return NextResponse.json({ ok: false, error: message, proceso_id: proceso.id }, { status: 500 });
  }
}
