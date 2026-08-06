"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import MeritSampleModal, { type MeritSample } from "./MeritSampleModal";

type Convocatoria = {
  id: string;
  nombre: string;
  estado: string;
};

type Listado = {
  id: string;
  convocatoria_id: string;
  tipo: string;
  nombre_archivo: string;
  ruta_storage: string;
  fecha_publicacion: string | null;
  estado: string;
  fecha_creacion: string | null;
  total_registros: number | null;
  fecha_procesamiento: string | null;
  error_procesamiento: string | null;
  fecha_corte: string | null;
  fuente_url: string | null;
  hash_archivo: string | null;
  estado_revision: string | null;
  funcion_calculo: string | null;
};

type Proceso = {
  id: string;
  listado_id: string;
  estado: string;
  progreso: number | null;
  modelo_ia: string | null;
  inicio_at: string | null;
  fin_at: string | null;
  error: string | null;
  pagina_inicio: number | null;
  pagina_fin: number | null;
  pagina_actual: number | null;
  total_paginas: number | null;
  total_registros: number | null;
  lotes_completados: number | null;
  ultimo_error: string | null;
  reanudable: boolean | null;
};

function getErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;

  const error =
    "error" in payload && typeof payload.error === "string"
      ? payload.error
      : fallback;
  const detalle =
    "detalle" in payload && typeof payload.detalle === "string"
      ? payload.detalle.trim()
      : "";

  return detalle ? `${error} ${detalle}` : error;
}

async function readResponsePayload(response: Response) {
  const text = await response.text();

  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    const cleaned = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return {
      ok: false,
      error: cleaned || `El servidor respondió con HTTP ${response.status}.`,
    };
  }
}

function tipoLabel(tipo: string) {
  const labels: Record<string, string> = {
    convocatoria_bases: "Convocatoria / Bases",
    correccion_bases: "Corrección de bases",
    admitidos_excluidos: "Admitidos y excluidos",
    resultado_oposicion: "Resultado de oposición",
    baremo_meritos: "Baremo de méritos",
    meritos_provisionales: "Méritos provisionales",
    meritos_definitivos: "Méritos definitivos",
    bolsa_empleo: "Bolsa de empleo / referencia estadística",
    relacion_final: "Relación final",
    adjudicacion_nombramiento: "Adjudicación / nombramiento",
    otro_documento_oficial: "Otro documento oficial",
  };
  return labels[tipo] ?? tipo;
}

function formatDate(value: string | null) {
  if (!value) return "Sin fecha";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(date);
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pendiente: "Pendiente",
    ejecutando: "Procesando",
    procesando: "Procesando",
    completado: "Procesado",
    procesado: "Procesado",
    publicado: "Publicado",
    error: "Error",
  };
  return labels[status] ?? status;
}

function isMeritReference(item: Listado) {
  return item.tipo === "baremo_meritos" || item.tipo === "bolsa_empleo";
}

async function sha256File(file: File) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export default function ListadosManager() {
  const [listados, setListados] = useState<Listado[]>([]);
  const [convocatorias, setConvocatorias] = useState<Convocatoria[]>([]);
  const [procesos, setProcesos] = useState<Proceso[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [openingResultId, setOpeningResultId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processingSeveralId, setProcessingSeveralId] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [sampleLoadingId, setSampleLoadingId] = useState<string | null>(null);
  const [meritSample, setMeritSample] = useState<MeritSample | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadData = useCallback(async (showLoader = true) => {
    if (showLoader) {
      setLoading(true);
      setError("");
    }

    try {
      const [listadosResponse, procesosResponse] = await Promise.all([
        fetch("/api/admin/listados", { cache: "no-store" }),
        fetch("/api/admin/procesos", { cache: "no-store" }),
      ]);

      const [listadosPayload, procesosPayload] = await Promise.all([
        readResponsePayload(listadosResponse),
        readResponsePayload(procesosResponse),
      ]);

      if (!listadosResponse.ok) {
        throw new Error(getErrorMessage(listadosPayload, "No se pudieron cargar los listados."));
      }
      if (!procesosResponse.ok) {
        throw new Error(getErrorMessage(procesosPayload, "No se pudieron cargar los procesos."));
      }

      setListados(listadosPayload.listados ?? []);
      setConvocatorias(listadosPayload.convocatorias ?? []);
      setProcesos(procesosPayload.procesos ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los listados.");
    } finally {
      if (showLoader) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const hasActiveProcesses = useMemo(
    () => procesos.some(
      (item) => item.estado === "ejecutando" || (!item.reanudable && item.estado === "pendiente")
    ),
    [procesos]
  );

  useEffect(() => {
    if (!hasActiveProcesses) return;
    const timer = window.setInterval(() => void loadData(false), 3000);
    return () => window.clearInterval(timer);
  }, [hasActiveProcesses, loadData]);

  const latestProcessByListado = useMemo(() => {
    const map = new Map<string, Proceso>();
    for (const process of procesos) {
      if (!map.has(process.listado_id)) map.set(process.listado_id, process);
    }
    return map;
  }, [procesos]);

  const meritProcessByListado = useMemo(() => {
    const map = new Map<string, Proceso>();
    for (const process of procesos) {
      if (process.reanudable && !map.has(process.listado_id)) {
        map.set(process.listado_id, process);
      }
    }
    return map;
  }, [procesos]);

  const convocatoriaNames = useMemo(
    () => new Map(convocatorias.map((item) => [item.id, item.nombre])),
    [convocatorias]
  );

  const filteredListados = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    if (!query) return listados;
    return listados.filter((item) =>
      [
        item.nombre_archivo,
        item.tipo,
        item.estado,
        convocatoriaNames.get(item.convocatoria_id) ?? "",
      ]
        .join(" ")
        .toLocaleLowerCase("es")
        .includes(query)
    );
  }, [convocatoriaNames, listados, search]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("archivo");

    if (!(file instanceof File) || file.size <= 0) {
      setError("Selecciona un archivo PDF.");
      setSaving(false);
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setError("El PDF supera el tamaño máximo de 50 MB.");
      setSaving(false);
      return;
    }

    setMessage("Comprobando el documento…");
    const fileHash = await sha256File(file);

    const metadata = {
      convocatoria_id: String(formData.get("convocatoria_id") ?? ""),
      tipo: String(formData.get("tipo") ?? ""),
      estado: String(formData.get("estado") ?? "pendiente"),
      fecha_publicacion: String(formData.get("fecha_publicacion") ?? ""),
      nombre_archivo: file.name,
      tamano_archivo: file.size,
      mime_type: file.type || "application/pdf",
      hash_archivo: fileHash,
      fecha_corte: String(formData.get("fecha_corte") ?? ""),
      fuente_url: String(formData.get("fuente_url") ?? ""),
      funcion_calculo: String(formData.get("funcion_calculo") ?? ""),
    };

    try {
      setMessage("Preparando subida directa…");

      const prepareResponse = await fetch("/api/admin/listados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "prepare_upload", ...metadata }),
      });
      const preparePayload = await readResponsePayload(prepareResponse);

      if (!prepareResponse.ok || !preparePayload.upload?.signed_url) {
        throw new Error(
          getErrorMessage(preparePayload, "No se pudo preparar la subida del PDF.")
        );
      }

      setMessage("Subiendo PDF directamente a Supabase…");

      const uploadResponse = await fetch(preparePayload.upload.signed_url, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/pdf",
          "Cache-Control": "3600",
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        const uploadPayload = await readResponsePayload(uploadResponse);
        throw new Error(
          getErrorMessage(uploadPayload, `La subida directa falló con HTTP ${uploadResponse.status}.`)
        );
      }

      setMessage("Registrando documento…");

      const registerResponse = await fetch("/api/admin/listados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register_upload",
          ...metadata,
          ruta_storage: preparePayload.upload.path,
        }),
      });
      const registerPayload = await readResponsePayload(registerResponse);

      if (!registerResponse.ok) {
        throw new Error(
          getErrorMessage(registerPayload, "El PDF se subió, pero no se pudo registrar.")
        );
      }

      form.reset();
      setMessage("Documento subido y registrado correctamente.");
      await loadData(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el documento.");
      setMessage("");
    } finally {
      setSaving(false);
    }
  }

  async function openUrl(action: "download" | "result", item: Listado) {
    action === "download" ? setDownloadingId(item.id) : setOpeningResultId(item.id);
    setError("");

    try {
      const response = await fetch(
        `/api/admin/listados?action=${action}&id=${encodeURIComponent(item.id)}`,
        { cache: "no-store" }
      );
      const payload = await readResponsePayload(response);
      if (!response.ok || !payload.url) {
        throw new Error(
          getErrorMessage(
            payload,
            action === "download" ? "No se pudo descargar el PDF." : "No se pudo abrir el resultado."
          )
        );
      }
      window.open(payload.url, "_blank", "noopener,noreferrer");
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "No se pudo abrir el archivo.");
    } finally {
      action === "download" ? setDownloadingId(null) : setOpeningResultId(null);
    }
  }

  async function processListado(item: Listado) {
    if (!window.confirm(`¿Procesar “${item.nombre_archivo}”?`)) return;

    setProcessingId(item.id);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/procesar-listado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listado_id: item.id }),
      });
      const payload = await readResponsePayload(response);
      if (!response.ok) throw new Error(getErrorMessage(payload, "No se pudo procesar el listado."));

      const paginas = payload.resultado?.paginas ?? 0;
      const extraidos = payload.resultado?.registros_extraidos ?? 0;
      const esperados = payload.resultado?.total_esperado;
      const validacion =
        typeof esperados === "number"
          ? ` Registros: ${extraidos}/${esperados}.`
          : ` Registros extraídos: ${extraidos}.`;
      setMessage(`PDF procesado: ${paginas} páginas.${validacion}`);
    } catch (processingError) {
      setError(processingError instanceof Error ? processingError.message : "No se pudo procesar el listado.");
    } finally {
      setProcessingId(null);
      await loadData(false);
    }
  }

  async function processMeritBatches(item: Listado, requestedBatches: number) {
    if (
      requestedBatches === 1 &&
      !window.confirm(`¿Procesar el siguiente lote de 30 páginas de “${item.nombre_archivo}”?`)
    ) {
      return;
    }

    setProcessingId(item.id);
    setProcessingSeveralId(requestedBatches > 1 ? item.id : null);
    setError("");
    setMessage("");

    let executedBatches = 0;
    let lastCurrentPage = 0;
    let lastTotalPages = 0;
    let completed = false;

    try {
      for (let batch = 0; batch < requestedBatches; batch += 1) {
        const response = await fetch("/api/admin/procesar-lote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listado_id: item.id }),
        });
        const payload = await readResponsePayload(response);

        if (!response.ok) {
          throw new Error(
            getErrorMessage(payload, "No se pudo procesar el siguiente lote.")
          );
        }

        executedBatches += payload.ya_completado ? 0 : 1;
        lastCurrentPage = payload.progreso?.pagina_actual ?? lastCurrentPage;
        lastTotalPages = payload.progreso?.total_paginas ?? lastTotalPages;
        completed = payload.completado === true;
        await loadData(false);

        if (completed) break;
      }

      if (completed && executedBatches === 0) {
        setMessage("El documento ya estaba procesado por completo.");
      } else {
        const batchLabel = executedBatches === 1 ? "lote" : "lotes";
        const progressLabel = lastTotalPages > 0
          ? ` Página ${lastCurrentPage} de ${lastTotalPages}.`
          : "";
        setMessage(
          `${executedBatches} ${batchLabel} procesados correctamente.${progressLabel}${completed ? " Proceso completado." : ""}`
        );
      }
    } catch (processingError) {
      setError(
        processingError instanceof Error
          ? processingError.message
          : "No se pudo procesar el lote."
      );
      setMessage("");
    } finally {
      setProcessingId(null);
      setProcessingSeveralId(null);
      await loadData(false);
    }
  }

  function processSeveralMeritBatches(item: Listado) {
    const answer = window.prompt(
      "¿Cuántos lotes quieres procesar de forma secuencial? Introduce un número entre 2 y 10.",
      "3"
    );
    if (answer === null) return;

    const batches = Number(answer);
    if (!Number.isInteger(batches) || batches < 2 || batches > 10) {
      setError("El número de lotes debe ser un entero entre 2 y 10.");
      return;
    }

    void processMeritBatches(item, batches);
  }

  async function openMeritSample(item: Listado) {
    setSampleLoadingId(item.id);
    setError("");

    try {
      const response = await fetch(
        `/api/admin/fuentes-meritos?listado_id=${encodeURIComponent(item.id)}&limit=20`,
        { cache: "no-store" }
      );
      const payload = await readResponsePayload(response);
      if (!response.ok) {
        throw new Error(
          getErrorMessage(payload, "No se pudo cargar la muestra de méritos.")
        );
      }

      setMeritSample({
        listadoId: item.id,
        title: item.nombre_archivo,
        records: Array.isArray(payload.registros) ? payload.registros : [],
        summary: payload.resumen ?? {
          total: 0,
          formacion: { minima: null, maxima: null, media: null },
          experiencia: { minima: null, maxima: null, media: null },
          puntuacion_total: { minima: null, maxima: null, media: null },
          filas_con_advertencias: 0,
        },
      });
    } catch (sampleError) {
      setError(
        sampleError instanceof Error
          ? sampleError.message
          : "No se pudo cargar la muestra de méritos."
      );
    } finally {
      setSampleLoadingId(null);
    }
  }

  async function importListado(item: Listado) {
    const existing = item.total_registros ?? 0;
    const question = existing > 0
      ? `Este listado ya tiene ${existing} registros. ¿Validar y reimportar “${item.nombre_archivo}”?`
      : `¿Validar e importar los candidatos de “${item.nombre_archivo}”?`;

    if (!window.confirm(question)) return;

    setImportingId(item.id);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/importar-listado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listado_id: item.id }),
      });
      const payload = await readResponsePayload(response);
      if (!response.ok) {
        const detail = Array.isArray(payload.detalle)
          ? payload.detalle.join(" ")
          : typeof payload.detalle === "string"
            ? ` ${payload.detalle}`
            : "";
        throw new Error(`${getErrorMessage(payload, "No se pudo importar el listado.")}${detail}`);
      }

      setMessage(payload.mensaje ?? `${payload.registros_importados ?? 0} registros importados.`);
      await loadData(false);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "No se pudo importar el listado.");
    } finally {
      setImportingId(null);
    }
  }

  async function remove(item: Listado) {
    if (!window.confirm(`¿Eliminar “${item.nombre_archivo}”?`)) return;

    setDeletingId(item.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/listados?id=${encodeURIComponent(item.id)}`, {
        method: "DELETE",
      });
      const payload = await readResponsePayload(response);
      if (!response.ok) throw new Error(getErrorMessage(payload, "No se pudo eliminar el listado."));
      setMessage("Listado eliminado.");
      await loadData(false);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar el listado.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="admin-eyebrow">DOCUMENTOS</p>
          <h1>Documentos oficiales</h1>
          <p>Sube bases, convocatorias y listados oficiales, y controla su procesamiento.</p>
        </div>
        <span className="admin-live-badge">{listados.length} registrados</span>
      </header>

      <section className="admin-crud-grid">
        <article className="admin-panel-card admin-form-card">
          <div className="admin-panel-heading">
            <p className="admin-eyebrow">NUEVO</p>
            <h2>Subir documento</h2>
          </div>

          <form className="admin-data-form" onSubmit={submit}>
            <label>
              Convocatoria <span>*</span>
              <select name="convocatoria_id" required defaultValue="">
                <option value="" disabled>Selecciona una convocatoria</option>
                {convocatorias.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre}{item.estado ? ` · ${item.estado}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Tipo de documento <span>*</span>
              <select name="tipo" required defaultValue="">
                <option value="" disabled>Selecciona el tipo</option>
                <option value="convocatoria_bases">Convocatoria / Bases</option>
                <option value="correccion_bases">Corrección de bases</option>
                <option value="admitidos_excluidos">Admitidos y excluidos</option>
                <option value="resultado_oposicion">Resultado de oposición</option>
                <option value="baremo_meritos">Baremo de méritos</option>
                <option value="meritos_provisionales">Méritos provisionales</option>
                <option value="meritos_definitivos">Méritos definitivos</option>
                <option value="bolsa_empleo">Bolsa de empleo</option>
                <option value="relacion_final">Relación final</option>
                <option value="adjudicacion_nombramiento">Adjudicación / nombramiento</option>
                <option value="otro_documento_oficial">Otro documento oficial</option>
              </select>
            </label>

            <div className="admin-form-row">
              <label>
                Fecha oficial
                <input type="date" name="fecha_publicacion" />
              </label>
              <label>
                Estado <span>*</span>
                <select name="estado" defaultValue="pendiente" required>
                  <option value="pendiente">Pendiente</option>
                  <option value="procesando">Procesando</option>
                  <option value="procesado">Procesado</option>
                  <option value="error">Error</option>
                </select>
              </label>
            </div>

            <div className="admin-form-row">
              <label>
                Fecha de corte de datos
                <input type="date" name="fecha_corte" />
              </label>
              <label>
                Función en el cálculo
                <select name="funcion_calculo" defaultValue="">
                  <option value="">Solo archivo documental</option>
                  <option value="reglas">Define reglas de baremación</option>
                  <option value="candidatos">Aporta candidatos</option>
                  <option value="oposicion">Aporta puntuación de oposición</option>
                  <option value="meritos">Aporta méritos</option>
                  <option value="resultado_final">Aporta resultado final</option>
                  <option value="referencia_estadistica">Referencia estadística</option>
                </select>
              </label>
            </div>

            <label>
              URL de la fuente oficial
              <input type="url" name="fuente_url" placeholder="https://…" />
            </label>

            <label>
              Archivo PDF <span>*</span>
              <input type="file" name="archivo" accept="application/pdf,.pdf" required />
              <small>Formato PDF. Tamaño máximo: 50 MB.</small>
            </label>

            {error && <p className="admin-alert admin-alert-error">{error}</p>}
            {message && <p className="admin-alert admin-alert-success">{message}</p>}

            <div className="admin-form-actions">
              <button className="button button-primary" type="submit" disabled={saving || convocatorias.length === 0}>
                {saving ? "Subiendo…" : "Subir documento"}
              </button>
            </div>
          </form>
        </article>

        <article className="admin-panel-card admin-list-card">
          <div className="admin-list-toolbar">
            <div>
              <p className="admin-eyebrow">REGISTRO</p>
              <h2>Documentos existentes</h2>
            </div>
            <input
              className="admin-search-input"
              type="search"
              placeholder="Buscar…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          {loading ? (
            <div className="admin-loading-state">Cargando listados…</div>
          ) : filteredListados.length === 0 ? (
            <div className="admin-loading-state">No hay listados que mostrar.</div>
          ) : (
            <div className="admin-record-list">
              {filteredListados.map((item) => {
                const meritReference = isMeritReference(item);
                const process = meritReference
                  ? meritProcessByListado.get(item.id)
                  : latestProcessByListado.get(item.id);
                const active = process?.estado === "ejecutando" ||
                  (!meritReference && process?.estado === "pendiente");
                const completed = meritReference
                  ? process?.estado === "completado"
                  : item.estado === "procesado" || item.estado === "publicado" || process?.estado === "completado";
                const shownStatus = active ? process.estado : process?.estado === "error" ? "error" : item.estado;
                const supportsCandidateParsing = [
                  "resultado_oposicion",
                  "meritos_provisionales",
                  "meritos_definitivos",
                  "relacion_final",
                ].includes(item.tipo);
                const currentPage = Math.max(0, process?.pagina_actual ?? 0);
                const totalPages = Math.max(0, process?.total_paginas ?? 0);
                const batchProgress = totalPages > 0
                  ? Math.max(0, Math.min(100, Math.round((currentPage / totalPages) * 100)))
                  : 0;
                const extractedRecords = process?.total_registros ?? item.total_registros ?? 0;
                const lastError = process?.ultimo_error ?? process?.error ?? item.error_procesamiento;
                const locallyProcessing = processingId === item.id;

                return (
                  <article key={item.id} className="admin-record-card">
                    <div className="admin-record-main">
                      <div className="admin-record-title-row">
                        <h3>{item.nombre_archivo}</h3>
                        <span className="admin-state-pill">{statusLabel(shownStatus)}</span>
                      </div>
                      <p>{convocatoriaNames.get(item.convocatoria_id) ?? "Convocatoria no disponible"}</p>
                      <dl>
                        <div><dt>Tipo</dt><dd>{tipoLabel(item.tipo)}</dd></div>
                        <div><dt>Fecha oficial</dt><dd>{formatDate(item.fecha_publicacion)}</dd></div>
                        <div><dt>Subido</dt><dd>{formatDate(item.fecha_creacion)}</dd></div>
                        <div>
                          <dt>{meritReference ? "Extraídos" : "Importados"}</dt>
                          <dd>{meritReference ? extractedRecords : item.total_registros ?? 0}</dd>
                        </div>
                      </dl>

                      {meritReference && (
                        <section className="admin-batch-progress" aria-label="Progreso por lotes">
                          <div className="admin-progress-heading">
                            <span>Páginas {currentPage} / {totalPages || "por detectar"}</span>
                            <strong>{batchProgress}%</strong>
                          </div>
                          <progress value={batchProgress} max={100} />
                          <dl className="admin-batch-metrics">
                            <div><dt>Registros extraídos</dt><dd>{extractedRecords}</dd></div>
                            <div><dt>Lotes completados</dt><dd>{process?.lotes_completados ?? 0}</dd></div>
                            <div>
                              <dt>Último lote</dt>
                              <dd>
                                {process?.pagina_inicio && process?.pagina_fin
                                  ? `Pág. ${process.pagina_inicio}–${process.pagina_fin}`
                                  : "—"}
                              </dd>
                            </div>
                          </dl>
                        </section>
                      )}

                      {!meritReference && active && (
                        <div style={{ marginTop: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
                            <span>Procesando PDF</span>
                            <strong>{Math.max(0, Math.min(100, process.progreso ?? 0))}%</strong>
                          </div>
                          <progress
                            value={Math.max(0, Math.min(100, process.progreso ?? 0))}
                            max={100}
                            style={{ width: "100%", marginTop: 6 }}
                          />
                        </div>
                      )}

                      {lastError && (process?.estado === "error" || item.estado === "error") && (
                        <p className="admin-alert admin-alert-error" style={{ marginTop: 12 }}>
                          {lastError}
                        </p>
                      )}
                    </div>

                    <div className="admin-record-actions">
                      {meritReference ? (
                        <>
                          <button
                            className="button button-primary"
                            type="button"
                            onClick={() => void processMeritBatches(item, 1)}
                            disabled={locallyProcessing || active || completed}
                          >
                            {locallyProcessing && processingSeveralId !== item.id
                              ? "Procesando lote…"
                              : process?.estado === "error"
                                ? "Continuar"
                                : completed
                                  ? "Procesamiento completo"
                                  : "Procesar siguiente lote"}
                          </button>
                          <button
                            type="button"
                            onClick={() => processSeveralMeritBatches(item)}
                            disabled={locallyProcessing || active || completed}
                          >
                            {processingSeveralId === item.id
                              ? "Procesando en secuencia…"
                              : "Procesar varios lotes"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void openMeritSample(item)}
                            disabled={sampleLoadingId === item.id || extractedRecords === 0}
                          >
                            {sampleLoadingId === item.id ? "Cargando muestra…" : "Ver muestra"}
                          </button>
                          <small className="admin-source-note">
                            Referencia estadística de méritos. No importa personas en candidatos.
                          </small>
                        </>
                      ) : supportsCandidateParsing ? (
                        <button
                          className="button button-primary"
                          type="button"
                          onClick={() => void processListado(item)}
                          disabled={processingId === item.id || active}
                        >
                          {processingId === item.id || active
                            ? "Procesando…"
                            : completed
                              ? "Reprocesar PDF"
                              : process?.estado === "error"
                                ? "Reintentar"
                                : "Procesar PDF"}
                        </button>
                      ) : (
                        <small style={{ color: "#64748b", lineHeight: 1.45 }}>
                          Documento guardado como fuente normativa. No importa candidatos.
                        </small>
                      )}

                      {!meritReference && completed && (
                        <button
                          type="button"
                          onClick={() => void openUrl("result", item)}
                          disabled={openingResultId === item.id}
                        >
                          {openingResultId === item.id ? "Abriendo…" : "Ver resultado"}
                        </button>
                      )}

                      {!meritReference && completed && supportsCandidateParsing && (
                        <button
                          className="button button-primary"
                          type="button"
                          onClick={() => void importListado(item)}
                          disabled={importingId === item.id || active}
                        >
                          {importingId === item.id
                            ? "Importando…"
                            : (item.total_registros ?? 0) > 0
                              ? `Reimportar ${item.total_registros} registros`
                              : "Validar e importar"}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => void openUrl("download", item)}
                        disabled={downloadingId === item.id}
                      >
                        {downloadingId === item.id ? "Abriendo…" : "Descargar PDF"}
                      </button>

                      <button
                        className="danger"
                        type="button"
                        onClick={() => void remove(item)}
                        disabled={deletingId === item.id || active || locallyProcessing}
                      >
                        {deletingId === item.id ? "Eliminando…" : "Eliminar"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </article>
      </section>

      {meritSample ? (
        <MeritSampleModal
          sample={meritSample}
          onClose={() => setMeritSample(null)}
        />
      ) : null}
    </div>
  );
}
