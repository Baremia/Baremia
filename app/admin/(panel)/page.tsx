import { supabaseAdmin } from "../../../lib/supabase-admin";

type Metric = {
  label: string;
  value: number | null;
  helper: string;
};

async function countRows(table: string) {
  const { count, error } = await supabaseAdmin
    .schema("baremia")
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) {
    console.error(`No se pudo contar ${table}:`, error);
    return null;
  }

  return count ?? 0;
}

export default async function AdminDashboardPage() {
  const [convocatorias, candidatos, listados, estimaciones, pagos, procesosIa] =
    await Promise.all([
      countRows("convocatorias"),
      countRows("candidatos"),
      countRows("listados"),
      countRows("estimaciones"),
      countRows("pagos"),
      countRows("procesos_ia"),
    ]);

  const metrics: Metric[] = [
    {
      label: "Convocatorias",
      value: convocatorias,
      helper: "Procesos registrados",
    },
    {
      label: "Candidatos",
      value: candidatos,
      helper: "Personas localizables",
    },
    {
      label: "Listados",
      value: listados,
      helper: "Documentos oficiales",
    },
    {
      label: "Estimaciones",
      value: estimaciones,
      helper: "Resultados calculados",
    },
    {
      label: "Pagos",
      value: pagos,
      helper: "Operaciones registradas",
    },
    {
      label: "Procesos IA",
      value: procesosIa,
      helper: "Ejecuciones registradas",
    },
  ];

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="admin-eyebrow">RESUMEN GENERAL</p>
          <h1>Dashboard</h1>
          <p>Estado actual de la plataforma y sus principales recursos.</p>
        </div>
        <span className="admin-live-badge">Sistema conectado</span>
      </header>

      <section className="admin-metrics-grid" aria-label="Métricas principales">
        {metrics.map((metric) => (
          <article key={metric.label} className="admin-metric-card">
            <span>{metric.label}</span>
            <strong>{metric.value === null ? "—" : metric.value}</strong>
            <small>{metric.helper}</small>
          </article>
        ))}
      </section>

      <section className="admin-dashboard-grid">
        <article className="admin-panel-card">
          <div className="admin-panel-heading">
            <div>
              <p className="admin-eyebrow">PRÓXIMOS PASOS</p>
              <h2>Centro de operaciones</h2>
            </div>
          </div>

          <div className="admin-task-list">
            <div>
              <span>1</span>
              <div>
                <strong>Gestionar convocatorias</strong>
                <p>Crear, editar, activar y archivar procesos selectivos.</p>
              </div>
            </div>
            <div>
              <span>2</span>
              <div>
                <strong>Subir listados oficiales</strong>
                <p>Registrar los PDF y controlar su procesamiento.</p>
              </div>
            </div>
            <div>
              <span>3</span>
              <div>
                <strong>Publicar estimaciones</strong>
                <p>Revisar resultados antes de mostrarlos a los usuarios.</p>
              </div>
            </div>
          </div>
        </article>

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
        </aside>
      </section>
    </div>
  );
}
