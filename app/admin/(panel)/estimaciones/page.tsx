export default function Page() {
  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="admin-eyebrow">RESULTADOS</p>
          <h1>Estimaciones</h1>
          <p>Revisa, publica y consulta el historial de estimaciones.</p>
        </div>
      </header>

      <section className="admin-empty-state">
        <span>Próximo bloque</span>
        <h2>Calcular y publicar resultados</h2>
        <p>
          La sección ya está integrada en el panel y protegida. En el siguiente
          bloque conectaremos sus acciones con Supabase.
        </p>
      </section>
    </div>
  );
}
