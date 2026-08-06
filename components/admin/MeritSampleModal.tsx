"use client";

import { useEffect } from "react";

export type MeritSampleRecord = {
  id: string;
  dni_publicado: string | null;
  nombre_publicado: string;
  centro_grabacion: string | null;
  cupo_discapacidad: boolean;
  puntuacion_formacion: number | null;
  puntuacion_experiencia: number | null;
  puntuacion_total: number | null;
  numero_pagina: number | null;
  numero_fila: number | null;
  datos_extra: { advertencias?: unknown } | null;
};

type ScoreSummary = {
  minima: number | null;
  maxima: number | null;
  media: number | null;
};

export type MeritSample = {
  listadoId: string;
  title: string;
  records: MeritSampleRecord[];
  summary: {
    total: number;
    formacion: ScoreSummary;
    experiencia: ScoreSummary;
    puntuacion_total: ScoreSummary;
    filas_con_advertencias: number;
  };
};

type MeritSampleModalProps = {
  sample: MeritSample;
  onClose: () => void;
};

function formatScore(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value);
}

function rowWarningCount(record: MeritSampleRecord) {
  const warnings = record.datos_extra?.advertencias;
  return Array.isArray(warnings) ? warnings.length : 0;
}

export default function MeritSampleModal({
  sample,
  onClose,
}: MeritSampleModalProps) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="admin-modal-backdrop" role="presentation">
      <section
        className="admin-sample-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="merit-sample-title"
      >
        <header className="admin-sample-header">
          <div>
            <p className="admin-eyebrow">MUESTRA EXTRAÍDA</p>
            <h2 id="merit-sample-title">{sample.title}</h2>
            <p>Primeros {sample.records.length} registros ordenados por página y fila.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar muestra" autoFocus>
            Cerrar
          </button>
        </header>

        <div className="admin-sample-summary">
          <div><span>Total</span><strong>{sample.summary.total}</strong></div>
          <div>
            <span>Formación · mín / media / máx</span>
            <strong>
              {formatScore(sample.summary.formacion.minima)} / {formatScore(sample.summary.formacion.media)} / {formatScore(sample.summary.formacion.maxima)}
            </strong>
          </div>
          <div>
            <span>Experiencia · mín / media / máx</span>
            <strong>
              {formatScore(sample.summary.experiencia.minima)} / {formatScore(sample.summary.experiencia.media)} / {formatScore(sample.summary.experiencia.maxima)}
            </strong>
          </div>
          <div>
            <span>Total · mín / media / máx</span>
            <strong>
              {formatScore(sample.summary.puntuacion_total.minima)} / {formatScore(sample.summary.puntuacion_total.media)} / {formatScore(sample.summary.puntuacion_total.maxima)}
            </strong>
          </div>
          <div>
            <span>Filas con advertencias</span>
            <strong>{sample.summary.filas_con_advertencias}</strong>
          </div>
        </div>

        <div className="admin-sample-table-wrap">
          <table className="admin-sample-table">
            <thead>
              <tr>
                <th>Pág. / fila</th>
                <th>DNI publicado</th>
                <th>Nombre</th>
                <th>Centro</th>
                <th>Disc.</th>
                <th>Form.</th>
                <th>Exp.</th>
                <th>Total</th>
                <th>Avisos</th>
              </tr>
            </thead>
            <tbody>
              {sample.records.map((record) => (
                <tr key={record.id}>
                  <td>{record.numero_pagina ?? "—"} / {record.numero_fila ?? "—"}</td>
                  <td>{record.dni_publicado ?? "—"}</td>
                  <td>{record.nombre_publicado}</td>
                  <td>{record.centro_grabacion ?? "—"}</td>
                  <td>{record.cupo_discapacidad ? "Sí" : "No"}</td>
                  <td>{formatScore(record.puntuacion_formacion)}</td>
                  <td>{formatScore(record.puntuacion_experiencia)}</td>
                  <td>{formatScore(record.puntuacion_total)}</td>
                  <td>{rowWarningCount(record)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sample.records.length === 0 ? (
            <p className="admin-loading-state">Todavía no hay registros para mostrar.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
