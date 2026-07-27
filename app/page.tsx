import Image from "next/image";

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a href="/" className="brand" aria-label="Baremia, inicio">
  <Image
    src="/logo.svg"
    alt="Baremia"
    width={320}
    height={78}
    priority
    className="brand-logo"
  />
  </a>

        <nav className="main-nav" aria-label="Navegación principal">
          <a href="#como-funciona">Cómo funciona</a>

          <a href="#convocatorias">Convocatorias</a>

          <button type="button" className="button button-secondary">
            Iniciar sesión
          </button>
        </nav>
      </header>

      <section className="hero">
        <div className="eyebrow">Basado en datos oficiales</div>

        <h1>¿Qué posibilidades tienes de conseguir plaza?</h1>

        <p className="hero-copy">
          Analizamos miles de datos oficiales para estimar tu posición y
          ayudarte a tomar mejores decisiones.
        </p>

        <div className="hero-actions">
          <button type="button" className="button button-primary">
            Calcular mi posición estimada
          </button>

          <a href="#convocatorias" className="button button-secondary">
            Ver convocatorias disponibles
          </a>
        </div>

        <p className="legal-note">
          Las estimaciones de Baremia son orientativas y no sustituyen los
          resultados oficiales.
        </p>
      </section>

      <section id="como-funciona" className="section section-white">
        <div className="section-inner">
          <div className="section-heading">
            <h2>Entiende tu situación en tres pasos</h2>

            <p>Menos hojas de cálculo. Más claridad.</p>
          </div>

          <div className="steps-grid">
            <article className="step-card">
              <span>01</span>

              <h3>Selecciona tu convocatoria</h3>

              <p>
                Elige el proceso selectivo y el listado que quieres analizar.
              </p>
            </article>

            <article className="step-card">
              <span>02</span>

              <h3>Introduce tus datos</h3>

              <p>
                Añade tu puntuación o localiza tus datos dentro de los
                documentos disponibles.
              </p>
            </article>

            <article className="step-card">
              <span>03</span>

              <h3>Consulta tu estimación</h3>

              <p>
                Obtén una posición aproximada y una explicación clara de tus
                opciones.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section id="convocatorias" className="section cta-section">
        <h2>Primera convocatoria en preparación</h2>

        <p>
          Estamos preparando el análisis de la OPE de Enfermería de la
          Comunidad de Madrid.
        </p>

        <button type="button" className="button button-dark">
          Avisarme cuando esté disponible
        </button>
      </section>

      <footer>
        © 2026 Baremia · Estimaciones inteligentes para opositores
      </footer>
    </main>
  );
}
