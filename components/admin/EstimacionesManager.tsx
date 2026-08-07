"use client";

import { useEffect, useState } from "react";

type Convocatoria = {
  id: string;
  nombre: string;
  estado: string | null;
};

type Cobertura = {
  candidatos: number;
  fuentes_meritos: number;
  coincidencias_directas: number;
  coincidencias_exactas: number;
  coincidencias_aproximadas: number;
  sin_coincidencia: number;
  porcentaje: number;
  cruce_version: number;
};

type BaremoOficial = {
  version: string;
  estado: string;
  fecha_publicacion: string | null;
  fuente_url: string | null;
  max_oposicion: number | string;
  max_concurso: number | string;
  max_experiencia: number | string;
  max_formacion_otras: number | string;
  reglas?: Record<string, unknown> | null;
  correcciones?: Array<Record<string, unknown>> | null;
};

type StatusPayload = {
  ok?: boolean;
  convocatorias?: Convocatoria[];
  estimaciones_v1?: number;
  cobertura?: Cobertura;
  baremo_oficial?: BaremoOficial | null;
  error?: string;
  detalle?: string;
};

async function readPayload(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as StatusPayload & Record<string, unknown>;
  } catch {
    return {
      ok: false,
      error: `El servidor respondió con HTTP ${response.status}.`,
      detalle: text.slice(0, 300),
    };
  }
}

function formatNumber(value: number | string | undefined) {
  if (value === undefined) return "0";
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat("es-ES").format(number) : String(value);
}

export default function EstimacionesManager() {
  const [convocatorias, setConvocatorias] = useState<Convocatoria[]>([]);
  const [convocatoriaId, setConvocatoriaId] = useState("");
  const [total, setTotal] = useState(0);
  const [coverage, setCoverage] = useState<Cobertura | null>(null);
  const [baremo, setBaremo] = useState<BaremoOficial | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/generar-estimaciones", {
        cache: "no-store",
      });
      const payload = await readPayload(response);
      if (!response.ok || !payload.ok) {
        throw new Error(payload.detalle || payload.error || "No se pudo cargar el motor.");
      }
      const items = payload.convocatorias ?? [];
      setConvocatorias(items);
      setTotal(payload.estimaciones_v1 ?? 0);
      setCoverage(payload.cobertura ?? null);
      setBaremo(payload.baremo_oficial ?? null);
      if (!convocatoriaId && items.length > 0) {
        const madrid = items.find((item) =>
          item.nombre.toLocaleLowerCase("es").includes("enfermería")
        );
        setConvocatoriaId((madrid ?? items[0]).id);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el motor.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function generate() {
    if (!convocatoriaId) return;
    if (
      !window.confirm(
        "¿Recalcular las 8.321 estimaciones con el cruce v2? Los cruces exactos y aproximados deben estar confirmados por el identificador publicado; el resto se imputará estadísticamente."
      )
    ) {
      return;
    }

    setGenerating(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/generar-estimaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ convocatoria_id: convocatoriaId }),
      });
      const payload = await readPayload(response);
      if (!response.ok || !payload.ok) {
        throw new Error(payload.detalle || payload.error || "No se pudieron generar las estimaciones.");
      }
      const result = payload.resultado as
        | {
            estimaciones_generadas?: number;
            coincidencias_directas?: number;
            meritos_imputados?: number;
          }
        | undefined;
      setMessage(
        typeof payload.mensaje === "string"
          ? payload.mensaje
          : `${result?.estimaciones_generadas ?? 0} estimaciones generadas.`
      );
      await load();
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "No se pudieron generar las estimaciones."
      );
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="admin-eyebrow">MOTOR V1 · CRUCE V2</p>
          <h1>Estimaciones</h1>
          <p>Calcula posiciones para Enfermería Madrid usando oposición oficial y méritos de referencia.</p>
        </div>
        <span className="admin-live-badge">{total} generadas</span>
      </header>

      <section className="admin-stats-grid" style={{ marginBottom: 24 }}>
        <article className="admin-stat-card">
          <span>Candidatos OPE</span>
          <strong>{coverage?.candidatos ?? 0}</strong>
          <small>aprobados importados</small>
        </article>
        <article className="admin-stat-card">
          <span>Cruce exacto</span>
          <strong>{coverage?.coincidencias_exactas ?? 0}</strong>
          <small>nombre + identificador compatible</small>
        </article>
        <article className="admin-stat-card">
          <span>Cruce aproximado</span>
          <strong>{coverage?.coincidencias_aproximadas ?? 0}</strong>
          <small>alta similitud + identificador compatible</small>
        </article>
        <article className="admin-stat-card">
          <span>Imputación estadística</span>
          <strong>{coverage?.sin_coincidencia ?? 0}</strong>
          <small>sin cruce suficientemente seguro</small>
        </article>
      </section>

      {baremo && (
        <section className="admin-panel-card" style={{ marginBottom: 24 }}>
          <div className="admin-panel-heading">
            <p className="admin-eyebrow">BAREMO OFICIAL</p>
            <h2>Reglas vigentes de la convocatoria</h2>
            <p>
              Publicado {baremo.fecha_publicacion ?? "—"} · versión {baremo.version}
            </p>
          </div>

          <section className="admin-stats-grid" style={{ marginTop: 18 }}>
            <article className="admin-stat-card">
              <span>Fase de oposición</span>
              <strong>{formatNumber(baremo.max_oposicion)}</strong>
              <small>puntos máximos</small>
            </article>
            <article className="admin-stat-card">
              <span>Fase de concurso</span>
              <strong>{formatNumber(baremo.max_concurso)}</strong>
              <small>puntos máximos</small>
            </article>
            <article className="admin-stat-card">
              <span>Experiencia</span>
              <strong>{formatNumber(baremo.max_experiencia)}</strong>
              <small>máximo dentro del concurso</small>
            </article>
            <article className="admin-stat-card">
              <span>Formación y otras</span>
              <strong>{formatNumber(baremo.max_formacion_otras)}</strong>
              <small>máximo dentro del concurso</small>
            </article>
          </section>

          <div className="admin-info-box" style={{ marginTop: 18 }}>
            <strong>Regla principal de experiencia</strong>
            <p>
              La misma categoría de Enfermería en centros sanitarios públicos del SNS se valora a
              0,006 puntos por día, hasta un máximo de 35 puntos. El baremo distingue además otros
              tipos de Administración y centros privados con coeficientes distintos.
            </p>
            <p style={{ marginBottom: 0 }}>
              La corrección publicada el 26/08/2025 afecta al apartado de docencia 2.2.d. La bolsa
              histórica sigue siendo una referencia estadística: sus 80 puntos de experiencia y 20 de
              formación no equivalen directamente a los 35 + 15 de esta OPE.
            </p>
          </div>

          {baremo.fuente_url && (
            <p style={{ marginBottom: 0, marginTop: 14 }}>
              <a href={baremo.fuente_url} target="_blank" rel="noreferrer">
                Abrir publicación oficial del baremo
              </a>
            </p>
          )}
        </section>
      )}

      <section className="admin-panel-card admin-form-card" style={{ maxWidth: 760 }}>
        <div className="admin-panel-heading">
          <p className="admin-eyebrow">CÁLCULO</p>
          <h2>Generar estimaciones</h2>
        </div>

        <div className="admin-data-form">
          <label>
            Convocatoria <span>*</span>
            <select
              value={convocatoriaId}
              onChange={(event) => setConvocatoriaId(event.target.value)}
              disabled={loading || generating}
            >
              <option value="">Selecciona una convocatoria</option>
              {convocatorias.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nombre}{item.estado ? ` · ${item.estado}` : ""}
                </option>
              ))}
            </select>
          </label>

          <div className="admin-info-box">
            <strong>Modelo Madrid Enfermería v1 · cruce de identidades v2</strong>
            <p>
              El motor acepta primero coincidencias exactas de nombre confirmadas por el fragmento
              compatible del identificador publicado. Después admite un grupo pequeño de variantes de
              nombre con similitud alta, siempre confirmadas por el mismo identificador y con margen
              suficiente frente a la segunda mejor coincidencia. Los casos restantes no se fuerzan y se
              estiman por banda de nota de oposición.
            </p>
            <p style={{ marginBottom: 0 }}>
              Cobertura directa actual: <strong>{coverage?.porcentaje ?? 0}%</strong> · fuente de méritos:{" "}
              <strong>{coverage?.fuentes_meritos ?? 0}</strong> registros.
            </p>
          </div>

          {error && <div className="admin-alert admin-alert-error">{error}</div>}
          {message && <div className="admin-alert admin-alert-success">{message}</div>}

          <button
            className="admin-primary-button"
            type="button"
            onClick={generate}
            disabled={!convocatoriaId || loading || generating || !coverage?.coincidencias_directas}
          >
            {generating ? "Calculando…" : "Recalcular estimaciones"}
          </button>
        </div>
      </section>
    </div>
  );
}
