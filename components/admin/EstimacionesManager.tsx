"use client";

import { useEffect, useState } from "react";

type Convocatoria = {
  id: string;
  nombre: string;
  estado: string | null;
};

type StatusPayload = {
  ok?: boolean;
  convocatorias?: Convocatoria[];
  estimaciones_v1?: number;
  error?: string;
  detalle?: string;
};

export default function EstimacionesManager() {
  const [convocatorias, setConvocatorias] = useState<Convocatoria[]>([]);
  const [convocatoriaId, setConvocatoriaId] = useState("");
  const [total, setTotal] = useState(0);
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
      const payload = (await response.json()) as StatusPayload;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.detalle || payload.error || "No se pudo cargar el motor.");
      }
      const items = payload.convocatorias ?? [];
      setConvocatorias(items);
      setTotal(payload.estimaciones_v1 ?? 0);
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
    if (!window.confirm("¿Generar o recalcular todas las estimaciones v1 de esta convocatoria?")) {
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
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.detalle || payload.error || "No se pudieron generar las estimaciones.");
      }
      setMessage(payload.mensaje || "Estimaciones generadas correctamente.");
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
          <p className="admin-eyebrow">MOTOR V1</p>
          <h1>Estimaciones</h1>
          <p>Calcula posiciones para Enfermería Madrid usando oposición oficial y méritos de referencia.</p>
        </div>
        <span className="admin-live-badge">{total} generadas</span>
      </header>

      <section className="admin-panel-card admin-form-card" style={{ maxWidth: 760 }}>
        <div className="admin-panel-heading">
          <p className="admin-eyebrow">CÁLCULO</p>
          <h2>Generar estimaciones v1</h2>
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
            <strong>Modelo Madrid Enfermería v1</strong>
            <p>
              Usa la nota oficial de oposición. Cuando encuentra una coincidencia inequívoca en la bolsa,
              adapta sus méritos al baremo de 50 puntos. Para el resto utiliza la mediana de candidatos con
              una nota de oposición similar y amplía el intervalo de incertidumbre.
            </p>
          </div>

          {error && <div className="admin-alert admin-alert-error">{error}</div>}
          {message && <div className="admin-alert admin-alert-success">{message}</div>}

          <button
            className="admin-primary-button"
            type="button"
            onClick={generate}
            disabled={!convocatoriaId || loading || generating}
          >
            {generating ? "Calculando…" : "Generar o recalcular estimaciones"}
          </button>
        </div>
      </section>
    </div>
  );
}
