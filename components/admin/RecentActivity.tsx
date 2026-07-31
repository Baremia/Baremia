export type DashboardActivity = {
  id: string;
  title: string;
  detail: string;
  date: string | null;
};

type RecentActivityProps = {
  items: DashboardActivity[];
};

function formatDate(value: string | null) {
  if (!value) return "Fecha no disponible";

  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function RecentActivity({ items }: RecentActivityProps) {
  return (
    <article className="admin-panel-card">
      <div className="admin-panel-heading">
        <div>
          <p className="admin-eyebrow">ACTIVIDAD RECIENTE</p>
          <h2>Últimos cambios</h2>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="admin-loading-state">Todavía no hay actividad para mostrar.</p>
      ) : (
        <div className="admin-task-list">
          {items.map((item, index) => (
            <div key={item.id}>
              <span>{index + 1}</span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.detail} · {formatDate(item.date)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
