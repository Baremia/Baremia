export default function Page() {
  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="admin-eyebrow">DOCUMENTOS</p>
          <h1>Listados oficiales</h1>
          <p>Controla los PDF oficiales y su estado de procesamiento.</p>
        </div>
      </header>

      <section className="admin-empty-state">
        <span>Próximo bloque</span>
        <h2>Subir y procesar PDF</h2>
        <p>
          La sección ya está integrada en el panel y protegida. En el siguiente
          bloque conectaremos sus acciones con Supabase.
        </p>
      </section>
    </div>
  );
}
