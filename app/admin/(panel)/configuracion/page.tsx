export default function Page() {
  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="admin-eyebrow">SISTEMA</p>
          <h1>Configuración</h1>
          <p>Gestiona los parámetros internos de cada convocatoria.</p>
        </div>
      </header>

      <section className="admin-empty-state">
        <span>Próximo bloque</span>
        <h2>Configurar el motor de Baremia</h2>
        <p>
          La sección ya está integrada en el panel y protegida. En el siguiente
          bloque conectaremos sus acciones con Supabase.
        </p>
      </section>
    </div>
  );
}
