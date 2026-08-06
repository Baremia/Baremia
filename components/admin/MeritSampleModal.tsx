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
  pagination: {
    offset: number;
    limit: number;
    from: number;
    to: number;
    hasPrevious: boolean;
    hasNext: boolean;
  };
};

type MeritSampleModalProps = {
  sample: MeritSample;
  loading: boolean;
  onNavigate: (offset: number) => void | Promise<void>;
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
  loading,
  onNavigate,
  onClose,
}: MeritSampleModalProps) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const { offset, limit, from, to, hasPrevious, hasNext } = sample.pagination;
  const total = sample.summary.total;
  const lastOffset = total > 0 ? Math.floor((total - 1) / limit) * limit : 0;

  function openRandomSample() {
    if (total <= limit) {
      void onNavigate(0);
      return;
    }
    const pages = Math.ceil(total / limit);
    const randomPage = Math.floor(Math.random() * pages);
    void onNavigate(randomPage * limit);
  }

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
            <p className="admin-eyebrow">REVISIÓN DE DATOS EXTRAÍDOS</p>
            <h2 id="merit-sample-title">{sample.title}</h2>
            <p>
              Registros {from || 0}–{to || 0} de {total}. Puedes recorrer todo el
              documento o abrir una muestra aleatoria.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar muestra" autoFocus>
            Cerrar
          </button>
        </header>

        <div className="admin-sample-summary">
          <div><span>Total</span><strong>{total}</strong></div>
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

        <nav className="admin-sample-pagination" aria-label="Navegación de la muestra">
          <button type="button" onClick={() => void onNavigate(0)} disabled={loading || !hasPrevious}>
            Inicio
          </button>
          <button
            type="button"
            onClick={() => void onNavigate(Math.max(0, offset - limit))}
            disabled={loading || !hasPrevious}
          >
            Anterior
          </button>
          <span>{loading ? "Cargando…" : `${from || 0}–${to || 0} de ${total}`}</span>
          <button
            type="button"
            onClick={() => void onNavigate(offset + limit)}
            disabled={loading || !hasNext}
          >
            Siguiente
          </button>
          <button
            type="button"
            onClick={() => void onNavigate(lastOffset)}
            disabled={loading || !hasNext}
          >
            Final
          </button>
          <button type="button" onClick={openRandomSample} disabled={loading || total === 0}>
            Muestra aleatoria
          </button>
        </nav>

        <div className="admin-sample-table-wrap" aria-busy={loading}>
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
