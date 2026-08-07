"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Pago = {
  id: string;
  proveedor: string;
  estado: string;
  importe: number | string;
  moneda: string;
  email_cliente: string | null;
  fecha_pago: string | null;
  created_at: string;
  candidato: { id: string; nombre: string; dni: string | null } | null;
  entrega: {
    id: string;
    estado: string;
    email_destino: string;
    intentos: number;
    ultimo_error: string | null;
    enviado_at: string | null;
  } | null;
};

type Payload = {
  ok: boolean;
  error?: string;
  detalle?: string;
  resumen?: {
    total_pagos: number;
    pagados: number;
    reembolsados: number;
    entregas_error: number;
  };
  configuracion?: {
    resend: boolean;
    stripe_checkout: boolean;
    stripe_webhook: boolean;
    precio: string | null;
  };
  pagos?: Pago[];
};

function date(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("es-ES", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(parsed);
}

function money(value: number | string, currency: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(parsed)
    : `${value} ${currency}`;
}

export default function PagosManager() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/pagos", { cache: "no-store" });
      const data = (await response.json()) as Payload;
      if (!response.ok || !data.ok) {
        throw new Error(data.detalle || data.error || "No se pudieron cargar los pagos.");
      }
      setPayload(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los pagos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    const rows = payload?.pagos ?? [];
    if (!query) return rows;
    return rows.filter((item) =>
      [
        item.candidato?.nombre ?? "",
        item.candidato?.dni ?? "",
        item.email_cliente ?? "",
        item.proveedor,
        item.estado,
        item.entrega?.estado ?? "",
      ]
        .join(" ")
        .toLocaleLowerCase("es")
        .includes(query)
    );
  }, [payload?.pagos, search]);

  async function retry(payment: Pago) {
    if (!window.confirm("¿Reintentar el envío del código de acceso de este pago?")) return;
    setRetrying(payment.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/pagos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reintentar_entrega", pago_id: payment.id }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.detalle || data.error || "No se pudo reintentar la entrega.");
      }
      setMessage(data.mensaje ?? "Entrega procesada.");
      await load();
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "No se pudo reintentar la entrega.");
    } finally {
      setRetrying(null);
    }
  }

  const summary = payload?.resumen;
  const config = payload?.configuracion;

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="admin-eyebrow">COBROS</p>
          <h1>Pagos y entregas</h1>
          <p>Controla pagos, generación de accesos y envío de códigos BRM.</p>
        </div>
      </header>

      <section className="admin-stats-grid">
        <article><span>Total pagos</span><strong>{summary?.total_pagos ?? 0}</strong></article>
        <article><span>Pagados</span><strong>{summary?.pagados ?? 0}</strong></article>
        <article><span>Reembolsados</span><strong>{summary?.reembolsados ?? 0}</strong></article>
        <article><span>Entregas con error</span><strong>{summary?.entregas_error ?? 0}</strong></article>
      </section>

      <section className="admin-panel-card" style={{ marginBottom: 20 }}>
        <div className="admin-panel-heading">
          <p className="admin-eyebrow">CONFIGURACIÓN</p>
          <h2>Estado de producción</h2>
        </div>
        <p>
          Stripe Checkout: <strong>{config?.stripe_checkout ? "Configurado" : "Pendiente"}</strong> · Webhook: <strong>{config?.stripe_webhook ? "Configurado" : "Pendiente"}</strong> · Resend: <strong>{config?.resend ? "Configurado" : "Pendiente"}</strong> · Precio: <strong>{config?.precio ? `${Number(config.precio) / 100} €` : "Sin activar"}</strong>
        </p>
      </section>

      {error && <p className="admin-alert admin-alert-error">{error}</p>}
      {message && <p className="admin-alert admin-alert-success">{message}</p>}

      <section className="admin-panel-card admin-list-card">
        <div className="admin-list-toolbar">
          <div>
            <p className="admin-eyebrow">REGISTRO</p>
            <h2>Últimos pagos</h2>
          </div>
          <input
            className="admin-search-input"
            type="search"
            placeholder="Buscar nombre, DNI o email…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {loading ? (
          <div className="admin-loading-state">Cargando pagos…</div>
        ) : filtered.length === 0 ? (
          <div className="admin-loading-state">Todavía no hay pagos que mostrar.</div>
        ) : (
          <div className="admin-record-list">
            {filtered.map((payment) => (
              <article key={payment.id} className="admin-record-card">
                <div className="admin-record-main">
                  <div className="admin-record-title-row">
                    <h3>{payment.candidato?.nombre ?? "Candidato no disponible"}</h3>
                    <span className="admin-state-pill">{payment.estado}</span>
                  </div>
                  <p>{payment.candidato?.dni ?? "DNI no disponible"} · {payment.email_cliente ?? payment.entrega?.email_destino ?? "Sin email"}</p>
                  <dl>
                    <div><dt>Importe</dt><dd>{money(payment.importe, payment.moneda)}</dd></div>
                    <div><dt>Proveedor</dt><dd>{payment.proveedor}</dd></div>
                    <div><dt>Pago</dt><dd>{date(payment.fecha_pago ?? payment.created_at)}</dd></div>
                    <div><dt>Entrega</dt><dd>{payment.entrega?.estado ?? "No creada"}</dd></div>
                  </dl>
                  {payment.entrega?.ultimo_error && (
                    <p className="admin-alert admin-alert-error" style={{ marginTop: 12 }}>
                      {payment.entrega.ultimo_error}
                    </p>
                  )}
                </div>
                <div className="admin-record-actions">
                  {payment.entrega && ["error", "pendiente"].includes(payment.entrega.estado) && (
                    <button
                      className="button button-primary"
                      type="button"
                      onClick={() => void retry(payment)}
                      disabled={retrying === payment.id || !config?.resend}
                    >
                      {retrying === payment.id ? "Reintentando…" : "Reintentar correo"}
                    </button>
                  )}
                  {payment.entrega?.enviado_at && (
                    <small className="admin-source-note">Enviado {date(payment.entrega.enviado_at)}</small>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
