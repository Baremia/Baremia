"use client";

import { useEffect, useState } from "react";

type Fuente = {
  id: string;
  titulo: string;
  tipo: string;
  fecha_publicacion: string | null;
  fuente_url: string | null;
  estado_procesamiento: string;
  total_registros: number | null;
  procesado_at: string | null;
  error_procesamiento: string | null;
};

type Proceso = {
  id: string;
  estado: string;
  progreso: number | null;
  pagina_actual: number | null;
  total_paginas: number | null;
  total_registros: number | null;
  lotes_completados: number | null;
  ultimo_error: string | null;
};

type Payload = {
  ok?: boolean;
  fuente?: Fuente | null;
  proceso?: Proceso | null;
  esperado?: number;
  completado?: boolean;
  ya_completado?: boolean;
  progreso?: {
    pagina_actual?: number;
    total_paginas?: number;
    porcentaje?: number;
    total_registros?: number;
    lotes_completados?: number;
  };
  lote?: {
    pagina_inicio?: number;
    pagina_fin?: number;
    registros_extraidos?: number;
    filas_dudosas?: number;
    advertencias?: number;
  };
  error?: string;
  detalle?: string;
};

async function readPayload(response: Response): Promise<Payload> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Payload;
  } catch {
    return {
      ok: false,
      error: `El servidor respondió con HTTP ${response.status}.`,
      detalle: text.slice(0, 300),
    };
  }
}

function integer(value: number | null | undefined) {
  return new Intl.NumberFormat("es-ES").format(value ?? 0);
}

export default function HistoricalCalibrationManager() {
  const [fuente, setFuente] = useState<Fuente | null>(null);
  const [proceso, setProceso] = useState<Proceso | null>(null);
  const [esperado, setEsperado] = useState(19_136);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load(showLoader = true) {
    if (showLoader) setLoading(true);
    try {
      const response = await fetch("/api/admin/calibracion-historica", {
        cache: "no-store",
      });
      const payload = await readPayload(response);
      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.detalle || payload.error || "No se pudo cargar la calibración."
        );
      }
      setFuente(payload.fuente ?? null);
      setProceso(payload.proceso ?? null);
      setEsperado(payload.esperado ?? 19_136);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudo cargar la calibración."
      );
    } finally {
      if (showLoader) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function processAll() {
    if (!fuente?.id) {
      setError("No está registrada la fuente histórica 2018.");
      return;
    }

    if (
      !window.confirm(
        "Se procesará el listado oficial de concurso 2018 en lotes de 30 páginas. La operación solo alimenta la calibración interna y no modifica resultados públicos. ¿Continuar?"
      )
    ) {
      return;
    }

    setProcessing(true);
    setError("");
    setMessage("Iniciando calibración histórica…");

    let previousPage = Math.max(0, proceso?.pagina_actual ?? 0);
    const knownTotal = Math.max(0, proceso?.total_paginas ?? 0);
    const remaining = knownTotal > 0 ? Math.max(0, knownTotal - previousPage) : 436;
    const safetyLimit = Math.max(1, Math.ceil(remaining / 30) + 1);
    let completed = false;

    try {
      for (let batch = 0; batch < safetyLimit; batch += 1) {
        const response = await fetch("/api/admin/calibracion-historica", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listado_id: fuente.id }),
        });
        const payload = await readPayload(response);

        if (!response.ok || !payload.ok) {
          throw new Error(payload.detalle || payload.error || "Falló el lote histórico.");
        }

        const currentPage = payload.progreso?.pagina_actual ?? previousPage;
        const totalPages = payload.progreso?.total_paginas ?? knownTotal;
        const records = payload.progreso?.total_registros ?? 0;
        const batches = payload.progreso?.lotes_completados ?? batch + 1;
        completed = payload.completado === true || payload.ya_completado === true;

        if (!completed && currentPage <= previousPage) {
          throw new Error(
            "El histórico no avanzó de página. Se ha detenido para evitar un bucle."
          );
        }

        previousPage = currentPage;
        setMessage(
          `Procesando histórico 2018… página ${currentPage} de ${totalPages || "?"}. ${integer(records)} registros · ${batches} lotes.`
        );
        await load(false);

        if (completed) break;
      }

      if (!completed) {
        throw new Error(
          "Se alcanzó el límite de seguridad sin completar el histórico. Puede reanudarse desde el último lote."
        );
      }

      await load(false);
      setMessage(
        `Calibración histórica completada: ${integer(esperado)} registros identificables validados.`
      );
    } catch (processingError) {
      setError(
        processingError instanceof Error
          ? processingError.message
          : "No se pudo completar la calibración histórica."
      );
    } finally {
      setProcessing(false);
      await load(false);
    }
  }

  const currentPage = proceso?.pagina_actual ?? 0;
  const totalPages = proceso?.total_paginas ?? 436;
  const percent = proceso?.progreso ?? Math.round((currentPage / Math.max(totalPages, 1)) * 100);
  const records = proceso?.total_registros ?? fuente?.total_registros ?? 0;
  const complete =
    proceso?.estado === "completado" &&
    currentPage >= totalPages &&
    records === esperado;

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="admin-eyebrow">CALIBRACIÓN INTERNA</p>
          <h1>Histórico OPE Enfermería 2018</h1>
          <p>
            Valida el modelo de méritos actual contra puntuaciones reales de experiencia y formación de una OPE anterior.
          </p>
        </div>
        <span className="admin-live-badge">
          {complete ? "Validado" : `${percent}%`}
        </span>
      </header>

      <section className="admin-panel-card" style={{ marginBottom: 24 }}>
        <div className="admin-panel-heading">
          <p className="admin-eyebrow">FUENTE OFICIAL</p>
          <h2>{fuente?.titulo ?? "Fuente histórica no registrada"}</h2>
          <p>
            Listado definitivo de fase de concurso: AP.1 experiencia, AP.2 formación y total de concurso.
          </p>
        </div>

        {fuente?.fuente_url && (
          <p>
            <a href={fuente.fuente_url} target="_blank" rel="noreferrer">
              Abrir PDF oficial de Comunidad de Madrid
            </a>
          </p>
        )}

        <div className="admin-info-box">
          <strong>Uso de estos datos</strong>
          <p style={{ marginBottom: 0 }}>
            No se importan como candidatos actuales. Se guardan en una tabla aislada para comprobar si las conversiones estadísticas de Baremia son compatibles con méritos reales históricos.
          </p>
        </div>
      </section>

      <section className="admin-stats-grid" style={{ marginBottom: 24 }}>
        <article className="admin-stat-card">
          <span>Páginas</span>
          <strong>{integer(currentPage)} / {integer(totalPages)}</strong>
          <small>{percent}% procesado</small>
        </article>
        <article className="admin-stat-card">
          <span>Registros extraídos</span>
          <strong>{integer(records)}</strong>
          <small>de {integer(esperado)} identificables</small>
        </article>
        <article className="admin-stat-card">
          <span>Lotes</span>
          <strong>{integer(proceso?.lotes_completados)}</strong>
          <small>30 páginas por lote</small>
        </article>
        <article className="admin-stat-card">
          <span>Estado</span>
          <strong>{proceso?.estado ?? fuente?.estado_procesamiento ?? "pendiente"}</strong>
          <small>solo calibración interna</small>
        </article>
      </section>

      {error && <div className="admin-alert admin-alert-error">{error}</div>}
      {message && <div className="admin-alert admin-alert-success">{message}</div>}
      {proceso?.ultimo_error && !error && (
        <div className="admin-alert admin-alert-error">{proceso.ultimo_error}</div>
      )}

      <section className="admin-panel-card admin-form-card" style={{ maxWidth: 760 }}>
        <div className="admin-panel-heading">
          <p className="admin-eyebrow">PROCESAMIENTO</p>
          <h2>{complete ? "Histórico validado" : "Procesar fuente histórica"}</h2>
        </div>

        <button
          className="admin-primary-button"
          type="button"
          onClick={processAll}
          disabled={loading || processing || !fuente?.id || complete}
        >
          {complete
            ? "Procesamiento completo"
            : processing
              ? "Procesando histórico…"
              : currentPage > 0
                ? "Continuar hasta completar"
                : "Procesar histórico 2018 completo"}
        </button>

        <p style={{ marginBottom: 0, marginTop: 12, color: "#64748b", lineHeight: 1.5 }}>
          Mantén esta pestaña abierta durante la ejecución. Si se interrumpe, el proceso se reanuda desde la última página guardada.
        </p>
      </section>
    </div>
  );
}
