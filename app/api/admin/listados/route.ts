import { NextRequest, NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-auth";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

const BUCKET = "listados-oficiales";
const MAX_FILE_SIZE = 20 * 1024 * 1024;

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "Sesión de administrador no válida." },
    { status: 401 }
  );
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeFileName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

async function getConvocatorias() {
  const { data, error } = await supabaseAdmin
    .schema("baremia")
    .from("convocatorias")
    .select("id,nombre,estado")
    .order("nombre", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function GET(request: NextRequest) {
  if (!(await hasAdminSession())) return unauthorized();

  const action = cleanText(request.nextUrl.searchParams.get("action"));
  const id = cleanText(request.nextUrl.searchParams.get("id"));

  if (action === "result") {
    if (!id) {
      return NextResponse.json({ ok: false, error: "Falta el identificador." }, { status: 400 });
    }

    const { data: proceso, error: procesoError } = await supabaseAdmin
      .schema("baremia")
      .from("procesos_ia")
      .select("detalles,estado")
      .eq("listado_id", id)
      .eq("estado", "completado")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (procesoError) {
      return NextResponse.json(
        { ok: false, error: "No se pudo localizar el resultado procesado." },
        { status: 500 }
      );
    }

    const detalles = proceso?.detalles;
    const rutaProcesada =
      detalles &&
      typeof detalles === "object" &&
      "ruta_procesada" in detalles &&
      typeof detalles.ruta_procesada === "string"
        ? detalles.ruta_procesada
        : "";

    if (!rutaProcesada) {
      return NextResponse.json(
        { ok: false, error: "Este listado todavía no tiene un resultado disponible." },
        { status: 404 }
      );
    }

    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(rutaProcesada, 60);

    if (error || !data?.signedUrl) {
      return NextResponse.json(
        { ok: false, error: "No se pudo abrir el resultado procesado." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, url: data.signedUrl });
  }

  if (action === "download") {
    if (!id) {
      return NextResponse.json({ ok: false, error: "Falta el identificador." }, { status: 400 });
    }

    const { data: listado, error: listadoError } = await supabaseAdmin
      .schema("baremia")
      .from("listados")
      .select("id,ruta_storage")
      .eq("id", id)
      .single();

    if (listadoError || !listado?.ruta_storage) {
      return NextResponse.json(
        { ok: false, error: "No se encontró el archivo del listado." },
        { status: 404 }
      );
    }

    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(listado.ruta_storage, 60);

    if (error || !data?.signedUrl) {
      return NextResponse.json(
        { ok: false, error: "No se pudo generar el enlace de descarga." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, url: data.signedUrl });
  }

  const [{ data: listados, error: listadosError }, convocatorias] = await Promise.all([
    supabaseAdmin
      .schema("baremia")
      .from("listados")
      .select(
        "id,convocatoria_id,tipo,nombre_archivo,ruta_storage,fecha_publicacion,estado,fecha_creacion"
      )
      .order("fecha_creacion", { ascending: false }),
    getConvocatorias(),
  ]);

  if (listadosError) {
    console.error("Error cargando listados:", listadosError);
    return NextResponse.json(
      { ok: false, error: "No se pudieron cargar los listados.", detalle: listadosError.message },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { ok: true, listados: listados ?? [], convocatorias },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: NextRequest) {
  if (!(await hasAdminSession())) return unauthorized();

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Formulario no válido." }, { status: 400 });
  }

  const convocatoriaId = cleanText(formData.get("convocatoria_id"));
  const tipo = cleanText(formData.get("tipo"));
  const estado = cleanText(formData.get("estado")) || "pendiente";
  const fechaPublicacion = cleanText(formData.get("fecha_publicacion")) || null;
  const file = formData.get("archivo");

  if (!convocatoriaId || !tipo || !(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "Selecciona una convocatoria, un tipo y un archivo PDF." },
      { status: 400 }
    );
  }

  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ ok: false, error: "El archivo debe ser un PDF." }, { status: 400 });
  }

  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { ok: false, error: "El PDF debe ocupar entre 1 byte y 20 MB." },
      { status: 400 }
    );
  }

  if (fechaPublicacion && !/^\d{4}-\d{2}-\d{2}$/.test(fechaPublicacion)) {
    return NextResponse.json({ ok: false, error: "La fecha no es válida." }, { status: 400 });
  }

  const originalName = file.name || "listado.pdf";
  const normalizedName = safeFileName(originalName) || "listado.pdf";
  const storagePath = `originales/${convocatoriaId}/${Date.now()}-${normalizedName}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, bytes, {
      contentType: "application/pdf",
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    console.error("Error subiendo PDF:", uploadError);
    return NextResponse.json(
      { ok: false, error: "No se pudo subir el PDF.", detalle: uploadError.message },
      { status: 500 }
    );
  }

  const { data, error: insertError } = await supabaseAdmin
    .schema("baremia")
    .from("listados")
    .insert({
      convocatoria_id: convocatoriaId,
      tipo,
      nombre_archivo: originalName,
      ruta_storage: storagePath,
      fecha_publicacion: fechaPublicacion,
      estado,
    })
    .select(
      "id,convocatoria_id,tipo,nombre_archivo,ruta_storage,fecha_publicacion,estado,fecha_creacion"
    )
    .single();

  if (insertError) {
    await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
    console.error("Error registrando listado:", insertError);
    return NextResponse.json(
      { ok: false, error: "El PDF se subió, pero no se pudo registrar el listado.", detalle: insertError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, listado: data }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  if (!(await hasAdminSession())) return unauthorized();

  const id = cleanText(request.nextUrl.searchParams.get("id"));
  if (!id) {
    return NextResponse.json({ ok: false, error: "Falta el identificador." }, { status: 400 });
  }

  const { count, error: countError } = await supabaseAdmin
    .schema("baremia")
    .from("registros_listado")
    .select("id", { count: "exact", head: true })
    .eq("listado_id", id);

  if (countError) {
    return NextResponse.json(
      { ok: false, error: "No se pudo comprobar si el listado está procesado." },
      { status: 500 }
    );
  }

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { ok: false, error: "No se puede eliminar porque ya tiene registros procesados." },
      { status: 409 }
    );
  }

  const { data: listado, error: listadoError } = await supabaseAdmin
    .schema("baremia")
    .from("listados")
    .select("id,ruta_storage")
    .eq("id", id)
    .single();

  if (listadoError || !listado) {
    return NextResponse.json({ ok: false, error: "Listado no encontrado." }, { status: 404 });
  }

  const { error: deleteError } = await supabaseAdmin
    .schema("baremia")
    .from("listados")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json(
      { ok: false, error: "No se pudo eliminar el listado.", detalle: deleteError.message },
      { status: 500 }
    );
  }

  if (listado.ruta_storage) {
    const { error: storageError } = await supabaseAdmin.storage
      .from(BUCKET)
      .remove([listado.ruta_storage]);
    if (storageError) console.error("No se pudo eliminar el PDF del Storage:", storageError);
  }

  return NextResponse.json({ ok: true });
}
