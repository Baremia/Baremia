import { NextRequest, NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/admin-auth";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BUCKET = "listados-oficiales";
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const TIPOS_VALIDOS = [
  "convocatoria_bases",
  "correccion_bases",
  "admitidos_excluidos",
  "resultado_oposicion",
  "baremo_meritos",
  "meritos_provisionales",
  "meritos_definitivos",
  "bolsa_empleo",
  "relacion_final",
  "adjudicacion_nombramiento",
  "otro_documento_oficial",
];
const ESTADOS_VALIDOS = ["pendiente", "procesando", "procesado", "error"];

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

function mapListado(item: Record<string, unknown>) {
  return {
    id: item.id,
    convocatoria_id: item.convocatoria_id,
    tipo: item.tipo,
    nombre_archivo: item.titulo,
    ruta_storage: item.archivo_storage,
    fecha_publicacion: item.fecha_publicacion,
    estado: item.estado_procesamiento,
    fecha_creacion: item.created_at,
    total_registros: item.total_registros,
    fecha_procesamiento: item.procesado_at,
    error_procesamiento: item.error_procesamiento,
    fecha_corte: item.fecha_corte,
    fuente_url: item.fuente_url,
    hash_archivo: item.hash_archivo,
    estado_revision: item.estado_revision,
    funcion_calculo: item.funcion_calculo,
  };
}

async function getConvocatorias() {
  const { data, error } = await supabaseAdmin
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
      return NextResponse.json(
        { ok: false, error: "Falta el identificador." },
        { status: 400 }
      );
    }

    const { data: proceso, error: procesoError } = await supabaseAdmin
      .from("procesos_ia")
      .select("detalles,estado")
      .eq("listado_id", id)
      .eq("estado", "completado")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (procesoError) {
      return NextResponse.json(
        {
          ok: false,
          error: "No se pudo localizar el resultado procesado.",
          detalle: procesoError.message,
        },
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
        {
          ok: false,
          error: "Este listado todavía no tiene un resultado disponible.",
        },
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
      return NextResponse.json(
        { ok: false, error: "Falta el identificador." },
        { status: 400 }
      );
    }

    const { data: listado, error: listadoError } = await supabaseAdmin
      .from("listados")
      .select("id,archivo_storage")
      .eq("id", id)
      .single();

    if (listadoError || !listado?.archivo_storage) {
      return NextResponse.json(
        { ok: false, error: "No se encontró el archivo del listado." },
        { status: 404 }
      );
    }

    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(listado.archivo_storage, 60);

    if (error || !data?.signedUrl) {
      return NextResponse.json(
        { ok: false, error: "No se pudo generar el enlace de descarga." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, url: data.signedUrl });
  }

  try {
    const [{ data: listados, error: listadosError }, convocatorias] =
      await Promise.all([
        supabaseAdmin
          .from("listados")
          .select(
            "id,convocatoria_id,titulo,tipo,fecha_publicacion,archivo_storage,estado_procesamiento,created_at,total_registros,procesado_at,error_procesamiento,fecha_corte,fuente_url,hash_archivo,estado_revision,funcion_calculo"
          )
          .order("created_at", { ascending: false }),
        getConvocatorias(),
      ]);

    if (listadosError) throw listadosError;

    return NextResponse.json(
      {
        ok: true,
        listados: (listados ?? []).map((item) =>
          mapListado(item as unknown as Record<string, unknown>)
        ),
        convocatorias,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json(
      {
        ok: false,
        error: "No se pudieron cargar los listados.",
        detalle: message,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!(await hasAdminSession())) return unauthorized();

  const contentType = request.headers.get("content-type") ?? "";

  // Flujo recomendado para archivos grandes: el navegador sube directamente
  // a Supabase mediante una URL firmada y Vercel solo recibe metadatos JSON.
  if (contentType.includes("application/json")) {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "La petición no contiene un JSON válido." },
        { status: 400 }
      );
    }

    const action = cleanText(body.action);

    if (action === "prepare_upload") {
      const convocatoriaId = cleanText(body.convocatoria_id);
      const tipo = cleanText(body.tipo);
      const estado = cleanText(body.estado) || "pendiente";
      const fechaPublicacion = cleanText(body.fecha_publicacion) || null;
      const originalName = cleanText(body.nombre_archivo);
      const fileSize = Number(body.tamano_archivo ?? 0);
      const mimeType = cleanText(body.mime_type) || "application/pdf";
      const fileHash = cleanText(body.hash_archivo);

      if (!convocatoriaId || !tipo || !originalName) {
        return NextResponse.json(
          { ok: false, error: "Selecciona una convocatoria, un tipo y un archivo PDF." },
          { status: 400 }
        );
      }

      if (!TIPOS_VALIDOS.includes(tipo)) {
        return NextResponse.json(
          { ok: false, error: "El tipo de documento no es válido." },
          { status: 400 }
        );
      }

      if (!ESTADOS_VALIDOS.includes(estado)) {
        return NextResponse.json(
          { ok: false, error: "El estado de procesamiento no es válido." },
          { status: 400 }
        );
      }

      if (mimeType !== "application/pdf" && !originalName.toLowerCase().endsWith(".pdf")) {
        return NextResponse.json(
          { ok: false, error: "El archivo debe ser un PDF." },
          { status: 400 }
        );
      }

      if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_FILE_SIZE) {
        return NextResponse.json(
          { ok: false, error: "El PDF debe ocupar entre 1 byte y 50 MB." },
          { status: 400 }
        );
      }

      if (fechaPublicacion && !/^\d{4}-\d{2}-\d{2}$/.test(fechaPublicacion)) {
        return NextResponse.json(
          { ok: false, error: "La fecha no es válida." },
          { status: 400 }
        );
      }

      const { data: convocatoria, error: convocatoriaError } = await supabaseAdmin
        .from("convocatorias")
        .select("id")
        .eq("id", convocatoriaId)
        .maybeSingle();

      if (convocatoriaError || !convocatoria) {
        return NextResponse.json(
          { ok: false, error: "La convocatoria seleccionada no existe." },
          { status: 400 }
        );
      }

      if (fileHash) {
        const { data: duplicado, error: duplicadoError } = await supabaseAdmin
          .from("listados")
          .select("id,titulo")
          .eq("convocatoria_id", convocatoriaId)
          .eq("hash_archivo", fileHash)
          .maybeSingle();

        if (duplicadoError) {
          return NextResponse.json(
            { ok: false, error: "No se pudo comprobar si el documento ya existe." },
            { status: 500 }
          );
        }
        if (duplicado) {
          return NextResponse.json(
            { ok: false, error: `Este PDF ya está registrado como “${duplicado.titulo}”.` },
            { status: 409 }
          );
        }
      }

      const normalizedName = safeFileName(originalName) || "documento.pdf";
      const storagePath = `originales/${convocatoriaId}/${Date.now()}-${normalizedName}`;

      const { data: signedUpload, error: signedError } = await supabaseAdmin.storage
        .from(BUCKET)
        .createSignedUploadUrl(storagePath);

      if (signedError || !signedUpload?.signedUrl || !signedUpload?.token) {
        return NextResponse.json(
          {
            ok: false,
            error: "No se pudo preparar la subida directa del PDF.",
            detalle: signedError?.message,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        upload: {
          signed_url: signedUpload.signedUrl,
          token: signedUpload.token,
          path: storagePath,
        },
        metadata: {
          convocatoria_id: convocatoriaId,
          tipo,
          estado,
          fecha_publicacion: fechaPublicacion,
          nombre_archivo: originalName,
        },
      });
    }

    if (action === "register_upload") {
      const convocatoriaId = cleanText(body.convocatoria_id);
      const tipo = cleanText(body.tipo);
      const estado = cleanText(body.estado) || "pendiente";
      const fechaPublicacion = cleanText(body.fecha_publicacion) || null;
      const originalName = cleanText(body.nombre_archivo);
      const storagePath = cleanText(body.ruta_storage);
      const fechaCorte = cleanText(body.fecha_corte) || null;
      const fuenteUrl = cleanText(body.fuente_url) || null;
      const fileHash = cleanText(body.hash_archivo) || null;
      const funcionCalculo = cleanText(body.funcion_calculo) || null;

      if (!convocatoriaId || !tipo || !originalName || !storagePath) {
        return NextResponse.json(
          { ok: false, error: "Faltan datos para registrar el documento subido." },
          { status: 400 }
        );
      }

      if (!TIPOS_VALIDOS.includes(tipo) || !ESTADOS_VALIDOS.includes(estado)) {
        return NextResponse.json(
          { ok: false, error: "El tipo o el estado del documento no es válido." },
          { status: 400 }
        );
      }

      if (!storagePath.startsWith(`originales/${convocatoriaId}/`)) {
        return NextResponse.json(
          { ok: false, error: "La ruta del archivo no coincide con la convocatoria." },
          { status: 400 }
        );
      }

      const { data: objectInfo, error: infoError } = await supabaseAdmin.storage
        .from(BUCKET)
        .info(storagePath);

      if (infoError || !objectInfo) {
        return NextResponse.json(
          { ok: false, error: "El PDF no aparece en Storage después de la subida." },
          { status: 400 }
        );
      }

      const { data, error: insertError } = await supabaseAdmin
        .from("listados")
        .insert({
          convocatoria_id: convocatoriaId,
          titulo: originalName,
          tipo,
          fecha_publicacion: fechaPublicacion ?? new Date().toISOString().slice(0, 10),
          archivo_storage: storagePath,
          estado_procesamiento: estado,
          fecha_corte: fechaCorte,
          fuente_url: fuenteUrl,
          hash_archivo: fileHash,
          funcion_calculo: funcionCalculo,
          estado_revision: "pendiente",
        })
        .select(
          "id,convocatoria_id,titulo,tipo,fecha_publicacion,archivo_storage,estado_procesamiento,created_at,total_registros,procesado_at,error_procesamiento,fecha_corte,fuente_url,hash_archivo,estado_revision,funcion_calculo"
        )
        .single();

      if (insertError) {
        await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
        return NextResponse.json(
          {
            ok: false,
            error: "El PDF se subió, pero no se pudo registrar el documento.",
            detalle: insertError.message,
          },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { ok: true, listado: mapListado(data as unknown as Record<string, unknown>) },
        { status: 201 }
      );
    }

    return NextResponse.json(
      { ok: false, error: "Acción de subida no reconocida." },
      { status: 400 }
    );
  }

  // Compatibilidad temporal con el formulario antiguo para PDFs pequeños.
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Formulario no válido." },
      { status: 400 }
    );
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

  if (!TIPOS_VALIDOS.includes(tipo)) {
    return NextResponse.json(
      { ok: false, error: "El tipo de documento no es válido." },
      { status: 400 }
    );
  }

  if (!ESTADOS_VALIDOS.includes(estado)) {
    return NextResponse.json(
      { ok: false, error: "El estado de procesamiento no es válido." },
      { status: 400 }
    );
  }

  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json(
      { ok: false, error: "El archivo debe ser un PDF." },
      { status: 400 }
    );
  }

  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { ok: false, error: "El PDF debe ocupar entre 1 byte y 50 MB." },
      { status: 400 }
    );
  }

  const originalName = file.name || "documento.pdf";
  const normalizedName = safeFileName(originalName) || "documento.pdf";
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
    return NextResponse.json(
      { ok: false, error: "No se pudo subir el PDF.", detalle: uploadError.message },
      { status: 500 }
    );
  }

  const { data, error: insertError } = await supabaseAdmin
    .from("listados")
    .insert({
      convocatoria_id: convocatoriaId,
      titulo: originalName,
      tipo,
      fecha_publicacion: fechaPublicacion ?? new Date().toISOString().slice(0, 10),
      archivo_storage: storagePath,
      estado_procesamiento: estado,
    })
    .select(
      "id,convocatoria_id,titulo,tipo,fecha_publicacion,archivo_storage,estado_procesamiento,created_at,total_registros,procesado_at,error_procesamiento,fecha_corte,fuente_url,hash_archivo,estado_revision,funcion_calculo"
    )
    .single();

  if (insertError) {
    await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json(
      {
        ok: false,
        error: "El PDF se subió, pero no se pudo registrar el documento.",
        detalle: insertError.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { ok: true, listado: mapListado(data as unknown as Record<string, unknown>) },
    { status: 201 }
  );
}

export async function DELETE(request: NextRequest) {
  if (!(await hasAdminSession())) return unauthorized();

  const id = cleanText(request.nextUrl.searchParams.get("id"));
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Falta el identificador." },
      { status: 400 }
    );
  }

  const { count, error: countError } = await supabaseAdmin
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
      {
        ok: false,
        error: "No se puede eliminar porque ya tiene registros procesados.",
      },
      { status: 409 }
    );
  }

  const { data: listado, error: listadoError } = await supabaseAdmin
    .from("listados")
    .select("id,archivo_storage")
    .eq("id", id)
    .single();

  if (listadoError || !listado) {
    return NextResponse.json(
      { ok: false, error: "Listado no encontrado." },
      { status: 404 }
    );
  }

  const { error: deleteError } = await supabaseAdmin
    .from("listados")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json(
      {
        ok: false,
        error: "No se pudo eliminar el listado.",
        detalle: deleteError.message,
      },
      { status: 500 }
    );
  }

  if (listado.archivo_storage) {
    await supabaseAdmin.storage.from(BUCKET).remove([listado.archivo_storage]);
  }

  return NextResponse.json({ ok: true });
}
