export default function Page() {
  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="admin-eyebrow">GESTIÓN</p>
          <h1>Convocatorias</h1>
          <p>Administra los procesos selectivos disponibles en Baremia.</p>
        </div>
      </header>

      <section className="admin-empty-state">
        <span>Próximo bloque</span>
        <h2>Crear y editar convocatorias</h2>
        <p>
          La sección ya está integrada en el panel y protegida. En el siguiente
          bloque conectaremos sus acciones con Supabase.
        </p>
      </section>
    </div>
  );
}
