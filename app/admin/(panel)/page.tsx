"use client";

import { useCallback, useEffect, useState } from "react";
import DashboardStats, {
  type DashboardMetrics,
} from "../../../components/admin/DashboardStats";
import RecentActivity, {
  type DashboardActivity,
} from "../../../components/admin/RecentActivity";

type DashboardResponse = {
  ok: boolean;
  metrics?: DashboardMetrics;
  actividad?: DashboardActivity[];
  generatedAt?: string;
  error?: string;
};

const emptyMetrics: DashboardMetrics = {
  convocatorias: null,
  candidatos: null,
  listados: null,
  estimaciones: null,
  pagos: null,
  procesosIa: null,
};

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics>(emptyMetrics);
  const [activity, setActivity] = useState<DashboardActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/dashboard", {
        method: "GET",
        cache: "no-store",
      });
      const data = (await response.json()) as DashboardResponse;

      if (!response.ok || !data.ok || !data.metrics) {
        throw new Error(data.error || "No se pudo cargar el dashboard.");
      }

      setMetrics(data.metrics);
      setActivity(data.actividad ?? []);
      setGeneratedAt(data.generatedAt ?? null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No se pudo cargar el dashboard."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="admin-eyebrow">RESUMEN GENERAL</p>
          <h1>Dashboard</h1>
          <p>Estado actual de la plataforma y sus principales recursos.</p>
        </div>
        <button
          type="button"
          className="admin-live-badge"
          onClick={() => void loadDashboard()}
          disabled={loading}
        >
          {loading ? "Actualizando…" : "Actualizar datos"}
        </button>
      </header>

      {error && <p className="admin-alert admin-alert-error">{error}</p>}

      <DashboardStats metrics={metrics} />

      <section className="admin-dashboard-grid">
        <RecentActivity items={activity} />

        <aside className="admin-panel-card admin-status-card">
          <p className="admin-eyebrow">ESTADO</p>
          <h2>Base operativa</h2>
          <ul>
            <li><span /> Supabase conectado</li>
            <li><span /> Sesión de administración protegida</li>
            <li><span /> Dashboard con datos reales</li>
            <li className="pending"><span /> Carga de PDF pendiente</li>
            <li className="pending"><span /> Motor IA pendiente</li>
          </ul>
          {generatedAt && (
            <small>
              Actualizado: {new Intl.DateTimeFormat("es-ES", {
                dateStyle: "short",
                timeStyle: "medium",
              }).format(new Date(generatedAt))}
            </small>
          )}
        </aside>
      </section>
    </div>
  );
}
