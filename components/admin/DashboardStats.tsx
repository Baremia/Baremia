export type DashboardMetrics = {
  convocatorias: number | null;
  candidatos: number | null;
  listados: number | null;
  estimaciones: number | null;
  pagos: number | null;
  procesosIa: number | null;
};

type DashboardStatsProps = {
  metrics: DashboardMetrics;
};

const metricDefinitions: Array<{
  key: keyof DashboardMetrics;
  label: string;
  helper: string;
}> = [
  { key: "convocatorias", label: "Convocatorias", helper: "Procesos registrados" },
  { key: "candidatos", label: "Candidatos", helper: "Personas localizables" },
  { key: "listados", label: "Listados", helper: "Documentos oficiales" },
  { key: "estimaciones", label: "Estimaciones", helper: "Resultados calculados" },
  { key: "pagos", label: "Pagos", helper: "Operaciones registradas" },
  { key: "procesosIa", label: "Procesos IA", helper: "Ejecuciones registradas" },
];

function formatValue(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("es-ES").format(value);
}

export default function DashboardStats({ metrics }: DashboardStatsProps) {
  return (
    <section className="admin-metrics-grid" aria-label="Métricas principales">
      {metricDefinitions.map((metric) => (
        <article key={metric.key} className="admin-metric-card">
          <span>{metric.label}</span>
          <strong>{formatValue(metrics[metric.key])}</strong>
          <small>{metric.helper}</small>
        </article>
      ))}
    </section>
  );
}
