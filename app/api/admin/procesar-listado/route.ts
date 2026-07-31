import { NextRequest, NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-auth";
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
      tipo: "extraccion",
      estado: "ejecutando",
      progreso: 10,
      modelo_ia: "unpdf-1.6.2",
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

    await supabaseAdmin
      .schema("baremia")
      .from("procesos_ia")
      .update({ progreso: 35, detalles: { fase: "extraccion", archivo: listado.nombre_archivo } })
      .eq("id", proceso.id);

    const extracted = await extractPdfText(await file.arrayBuffer());
    if (extracted.requiresOcr) {
      throw new Error("El PDF parece escaneado o contiene muy poco texto. Necesitará OCR.");
    }

    const processedPath = `procesados/${listado.convocatoria_id}/${listado.id}.json`;
    const payload = JSON.stringify(
      {
        listado_id: listado.id,
        nombre_archivo: listado.nombre_archivo,
        procesado_at: new Date().toISOString(),
        total_paginas: extracted.totalPages,
        texto: extracted.text,
      },
      null,
      2
    );

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
      supabaseAdmin
        .schema("baremia")
        .from("procesos_ia")
        .update({
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
          },
        })
        .eq("id", proceso.id),
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
        caracteres: extracted.characters,
        lineas: extracted.lines,
        ruta_procesada: processedPath,
      },
    });
  } catch (error) {
    const message = errorMessage(error);
    const finishedAt = new Date().toISOString();

    await Promise.all([
      supabaseAdmin
        .schema("baremia")
        .from("procesos_ia")
        .update({ estado: "error", fin_at: finishedAt, error: message, detalles: { fase: "error" } })
        .eq("id", proceso.id),
      supabaseAdmin
        .schema("baremia")
        .from("listados")
        .update({ estado: "error", error_procesamiento: message })
        .eq("id", listadoId),
    ]);

    return NextResponse.json({ ok: false, error: message, proceso_id: proceso.id }, { status: 500 });
  }
}
