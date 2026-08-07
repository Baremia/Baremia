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

type ModeloSombra = {
  modelo: string;
  total: number;
  directos: number;
  imputados: number;
  delta_meritos_media: number;
  delta_meritos_mediana: number;
  cambio_posicion_abs_mediana: number;
  cambio_posicion_abs_p90: number;
  cambio_posicion_abs_max: number;
  cambios_gt_100: number;
  cambios_gt_250: number;
  cambios_gt_500: number;
  entran_corte_general: number;
  salen_corte_general: number;
};

type StatusPayload = {
  ok?: boolean;
  convocatorias?: Convocatoria[];
  estimaciones_v1?: number;
  cobertura?: Cobertura;
  baremo_oficial?: BaremoOficial | null;
  modelo_sombra?: ModeloSombra | null;
  error?: string;
  detalle?: string;
  mensaje?: string;
  resultado?: {
    estimaciones_generadas?: number;
    coincidencias_directas?: number;
    meritos_imputados?: number;
  };
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

function formatNumber(value: number | string | undefined, digits = 0) {
  if (value === undefined) return "0";
  const number = Number(value);
  return Number.isFinite(number)
    ? new Intl.NumberFormat("es-ES", { maximumFractionDigits: digits }).format(number)
    : String(value);
}

export default function EstimacionesManager() {
  const [convocatorias, setConvocatorias] = useState<Convocatoria[]>([]);
  const [convocatoriaId, setConvocatoriaId] = useState("");
  const [total, setTotal] = useState(0);
  const [coverage, setCoverage] = useState<Cobertura | null>(null);
  const [baremo, setBaremo] = useState<BaremoOficial | null>(null);
  const [shadow, setShadow] = useState<ModeloSombra | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatingShadow, setGeneratingShadow] = useState(false);
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
      setShadow(payload.modelo_sombra ?? null);
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

  async function generatePublic() {
    if (!convocatoriaId) return;
    if (
      !window.confirm(
        "¿Recalcular las estimaciones PÚBLICAS v1? Esta acción actualiza los resultados que consultan los usuarios."
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
        body: JSON.stringify({ convocatoria_id: convocatoriaId, action: "publico" }),
      });
      const payload = await readPayload(response);
      if (!response.ok || !payload.ok) {
        throw new Error(payload.detalle || payload.error || "No se pudieron generar las estimaciones.");
      }
      setMessage(payload.mensaje || `${payload.resultado?.estimaciones_generadas ?? 0} estimaciones generadas.`);
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

  async function generateShadow() {
    if (!convocatoriaId) return;

    setGeneratingShadow(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/generar-estimaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ convocatoria_id: convocatoriaId, action: "sombra" }),
      });
      const payload = await readPayload(response);
      if (!response.ok || !payload.ok) {
        throw new Error(payload.detalle || payload.error || "No se pudo recalcular el modelo sombra.");
      }
      setMessage(payload.mensaje || "Modelo sombra recalculado.");
      await load();
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "No se pudo recalcular el modelo sombra."
      );
    } finally {
      setGeneratingShadow(false);
    }
  }

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="admin-eyebrow">MOTOR V1 · CRUCE V2</p>
          <h1>Estimaciones</h1>
          <p>Compara el modelo público con modelos experimentales sin exponerlos a los usuarios.</p>
        </div>
        <span className="admin-live-badge">{total} públicas</span>
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
            <p>Publicado {baremo.fecha_publicacion ?? "—"} · versión {baremo.version}</p>
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
              La bolsa histórica sigue siendo una referencia estadística: sus puntuaciones no se
              convierten automáticamente mediante una simple regla de tres.
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

      {shadow && shadow.total > 0 && (
        <section className="admin-panel-card" style={{ marginBottom: 24 }}>
          <div className="admin-panel-heading">
            <p className="admin-eyebrow">MODELO EXPERIMENTAL · NO PÚBLICO</p>
            <h2>Madrid Enfermería v1.1 sombra</h2>
            <p>
              Ajusta la experiencia de bolsa con factor 0,60 y mantiene provisionalmente la formación
              con factor 0,75. Ningún dato de esta sección llega a la consulta del usuario.
            </p>
          </div>

          <section className="admin-stats-grid" style={{ marginTop: 18 }}>
            <article className="admin-stat-card">
              <span>Δ méritos mediano</span>
              <strong>+{formatNumber(shadow.delta_meritos_mediana, 3)}</strong>
              <small>puntos frente a v1</small>
            </article>
            <article className="admin-stat-card">
              <span>Cambio mediano</span>
              <strong>{formatNumber(shadow.cambio_posicion_abs_mediana)}</strong>
              <small>puestos en valor absoluto</small>
            </article>
            <article className="admin-stat-card">
              <span>Percentil 90</span>
              <strong>{formatNumber(shadow.cambio_posicion_abs_p90)}</strong>
              <small>puestos de desplazamiento</small>
            </article>
            <article className="admin-stat-card">
              <span>Cambio de corte</span>
              <strong>{shadow.entran_corte_general} / {shadow.salen_corte_general}</strong>
              <small>entran / salen del top 3.133</small>
            </article>
          </section>

          <div className="admin-info-box" style={{ marginTop: 18 }}>
            <strong>Impacto del cambio</strong>
            <p>
              {shadow.cambios_gt_100} candidatos cambian más de 100 puestos; {shadow.cambios_gt_250}
              cambian más de 250 y {shadow.cambios_gt_500} más de 500. El máximo observado es de {" "}
              {formatNumber(shadow.cambio_posicion_abs_max)} puestos.
            </p>
            <p style={{ marginBottom: 0 }}>
              Este modelo se utilizará para calibración y validación histórica antes de considerar una
              sustitución del resultado público.
            </p>
          </div>

          <button
            className="admin-secondary-button"
            type="button"
            onClick={generateShadow}
            disabled={!convocatoriaId || loading || generatingShadow}
            style={{ marginTop: 16 }}
          >
            {generatingShadow ? "Recalculando modelo sombra…" : "Recalcular modelo sombra v1.1"}
          </button>
        </section>
      )}

      <section className="admin-panel-card admin-form-card" style={{ maxWidth: 760 }}>
        <div className="admin-panel-heading">
          <p className="admin-eyebrow">MODELO PÚBLICO</p>
          <h2>Madrid Enfermería v1</h2>
        </div>

        <div className="admin-data-form">
          <label>
            Convocatoria <span>*</span>
            <select
              value={convocatoriaId}
              onChange={(event) => setConvocatoriaId(event.target.value)}
              disabled={loading || generating || generatingShadow}
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
            <strong>Resultado actualmente visible para usuarios</strong>
            <p>
              Cruce de identidades v2 con cobertura directa del {coverage?.porcentaje ?? 0}% sobre {" "}
              {coverage?.fuentes_meritos ?? 0} registros de referencia. Los casos sin cruce seguro se
              imputan por banda de nota de oposición.
            </p>
            <p style={{ marginBottom: 0 }}>
              Recalcular aquí sí modifica las estimaciones consultables con código BRM.
            </p>
          </div>

          {error && <div className="admin-alert admin-alert-error">{error}</div>}
          {message && <div className="admin-alert admin-alert-success">{message}</div>}

          <button
            className="admin-primary-button"
            type="button"
            onClick={generatePublic}
            disabled={!convocatoriaId || loading || generating || generatingShadow || !coverage?.coincidencias_directas}
          >
            {generating ? "Calculando…" : "Recalcular estimaciones públicas v1"}
          </button>
        </div>
      </section>
    </div>
  );
}
