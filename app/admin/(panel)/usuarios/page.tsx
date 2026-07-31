export default function Page() {
  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="admin-eyebrow">ACTIVIDAD</p>
          <h1>Usuarios y accesos</h1>
          <p>Consulta candidatos, pagos, accesos y sesiones de la plataforma.</p>
        </div>
      </header>

      <section className="admin-empty-state">
        <span>Próximo bloque</span>
        <h2>Gestionar usuarios y accesos</h2>
        <p>
          La sección ya está integrada en el panel y protegida. En el siguiente
          bloque conectaremos sus acciones con Supabase.
        </p>
      </section>
    </div>
  );
}
