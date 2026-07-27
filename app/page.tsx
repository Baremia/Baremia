import Link from "next/link";
import Header from "../components/Header";
import Footer from "../components/Footer";
import ConvocatoriaCard from "../components/ConvocatoriaCard";

export default function Home() {
  return (
    <main>
      <Header />

      <section className="hero">
        <div className="eyebrow">Basado en datos oficiales</div>
        <h1>¿Qué posibilidades tienes de conseguir plaza?</h1>
        <p className="hero-copy">
          Analizamos miles de datos oficiales para estimar tu posición y ayudarte
          a tomar mejores decisiones.
        </p>

        <div className="hero-actions">
          <Link href="/convocatorias" className="button button-primary">
            Calcular mi posición estimada
          </Link>
          <Link href="/convocatorias" className="button button-secondary">
            Ver convocatorias disponibles
          </Link>
        </div>

        <p className="legal-note">
          Las estimaciones de Baremia son orientativas y no sustituyen los
          resultados oficiales.
        </p>
      </section>

      <section id="como-funciona" className="section section-white">
        <div className="section-inner">
          <div className="section-heading">
            <span className="section-label">Cómo funciona</span>
            <h2>Entiende tu situación en tres pasos</h2>
            <p>Menos hojas de cálculo. Más claridad.</p>
          </div>

          <div className="steps-grid">
            <article className="step-card">
              <span>01</span>
              <h3>Selecciona tu convocatoria</h3>
              <p>Elige el proceso selectivo y el listado que quieres analizar.</p>
            </article>
            <article className="step-card">
              <span>02</span>
              <h3>Introduce tus datos</h3>
              <p>Añade tus puntuaciones y méritos en un formulario guiado.</p>
            </article>
            <article className="step-card">
              <span>03</span>
              <h3>Consulta tu estimación</h3>
              <p>Obtén una posición aproximada y una explicación clara.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="section featured-section">
        <div className="section-inner">
          <div className="section-heading section-heading-left">
            <span className="section-label">Convocatoria disponible</span>
            <h2>Empieza con Enfermería Madrid</h2>
            <p>La primera estimación de Baremia ya tiene un flujo propio.</p>
          </div>

          <div className="featured-grid">
            <ConvocatoriaCard
              href="/convocatorias/enfermeria-madrid"
              title="Enfermería"
              administration="Comunidad de Madrid"
              status="Disponible"
              description="Introduce tus datos del proceso selectivo y prepara el cálculo de tu posición estimada."
              places="OPE"
            />
            <aside className="trust-panel">
              <span className="trust-icon" aria-hidden="true">✓</span>
              <h3>Una estimación explicable</h3>
              <p>
                Baremia mostrará qué datos se utilizan, cómo se calcula el total
                y qué límites tiene la estimación.
              </p>
              <Link href="/convocatorias" className="text-link">
                Ver todas las convocatorias →
              </Link>
            </aside>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
