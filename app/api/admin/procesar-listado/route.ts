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
  return NextResponse.json(
    { ok: false, error: "Sesión de administrador no válida." },
    { status: 401 }
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Error desconocido durante el procesamiento.";
}

async function updateProcess(
  processId: string,
  values: Record<string, unknown>
) {
  const { error } = await supabaseAdmin
    .from("procesos_ia")
    .update(values)
    .eq("id", processId);

  if (error) throw new Error(error.message);
}

export async function POST(request: NextRequest) {
  if (!(await hasAdminSession())) return unauthorized();

  let listadoId = "";
  try {
    const body = await request.json();
    listadoId =
      typeof body?.listado_id === "string" ? body.listado_id.trim() : "";
  } catch {
    return NextResponse.json(
      { ok: false, error: "Solicitud no válida." },
      { status: 400 }
    );
  }

  if (!listadoId) {
    return NextResponse.json(
      { ok: false, error: "Falta el identificador del listado." },
      { status: 400 }
    );
  }

  const { data: activeProcess, error: activeProcessError } = await supabaseAdmin
    .from("procesos_ia")
    .select("id")
    .eq("listado_id", listadoId)
    .in("estado", ["pendiente", "ejecutando"])
    .limit(1)
    .maybeSingle();

  if (activeProcessError) {
    return NextResponse.json(
      { ok: false, error: "No se pudo comprobar el estado del proceso." },
      { status: 500 }
    );
  }

  if (activeProcess) {
    return NextResponse.json(
      { ok: false, error: "Este listado ya tiene un proceso activo." },
      { status: 409 }
    );
  }

  const { data: listado, error: listadoError } = await supabaseAdmin
    .from("listados")
    .select("id,convocatoria_id,titulo,archivo_storage")
    .eq("id", listadoId)
    .single();

  if (listadoError || !listado?.archivo_storage) {
    return NextResponse.json(
      { ok: false, error: "Listado o archivo PDF no encontrado." },
      { status: 404 }
    );
  }

  const now = new Date().toISOString();
  const { data: proceso, error: processError } = await supabaseAdmin
    .from("procesos_ia")
    .insert({
      listado_id: listadoId,
      tipo: "extraccion",
      estado: "ejecutando",
      progreso: 5,
      modelo_ia: "baremia-parser-v1",
      inicio_at: now,
      detalles: { fase: "descarga", archivo: listado.titulo },
    })
    .select("id")
    .single();

  if (processError || !proceso) {
    return NextResponse.json(
      {
        ok: false,
        error: "No se pudo iniciar el proceso.",
        detalle: processError?.message,
      },
      { status: 500 }
    );
  }

  await supabaseAdmin
    .from("listados")
    .update({ estado_procesamiento: "procesando", error_procesamiento: null })
    .eq("id", listadoId);

  try {
    const { data: file, error: downloadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .download(listado.archivo_storage);

    if (downloadError || !file) {
      throw new Error(downloadError?.message || "No se pudo descargar el PDF.");
    }

    await updateProcess(proceso.id, {
      progreso: 25,
      detalles: { fase: "extraccion_texto", archivo: listado.titulo },
    });

    const extracted = await extractPdfText(await file.arrayBuffer());

    if (extracted.requiresOcr) {
      throw new Error(
        "El PDF parece escaneado o contiene muy poco texto. Necesitará OCR."
      );
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
      throw new Error(
        "Se extrajo texto, pero no se reconoció ningún aspirante. Revisa el formato del PDF."
      );
    }

    const processedPath = `procesados/${listado.convocatoria_id}/${listado.id}.json`;
    const payload = JSON.stringify(
      {
        version: "baremia-parser-v1",
        listado_id: listado.id,
        convocatoria_id: listado.convocatoria_id,
        nombre_archivo: listado.titulo,
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

    if (uploadError) {
      throw new Error(`No se pudo guardar el resultado: ${uploadError.message}`);
    }

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
        .from("listados")
        .update({
          estado_procesamiento: "procesado",
          procesado_at: finishedAt,
          total_registros: parsed.registros.length,
          error_procesamiento: null,
        })
        .eq("id", listadoId),
    ]);

    return NextResponse.json({
      ok: true,
      proceso_id: proceso.id,
      resultado: {
        paginas: extracted.totalPages,
        lineas: extracted.lines,
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

    await Promise.allSettled([
      updateProcess(proceso.id, {
        estado: "error",
        fin_at: finishedAt,
        error: message,
        detalles: { fase: "error" },
      }),
      supabaseAdmin
        .from("listados")
        .update({
          estado_procesamiento: "error",
          error_procesamiento: message,
        })
        .eq("id", listadoId),
    ]);

    return NextResponse.json(
      { ok: false, error: message, proceso_id: proceso.id },
      { status: 500 }
    );
  }
}
