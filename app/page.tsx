export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f7f8fc",
        color: "#111827",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <header
        style={{
          maxWidth: "1180px",
          margin: "0 auto",
          padding: "24px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <strong
          style={{
            fontSize: "28px",
            color: "#1d4ed8",
            letterSpacing: "-0.8px",
          }}
        >
          Baremia
        </strong>

        <nav
          style={{
            display: "flex",
            gap: "28px",
            alignItems: "center",
            fontSize: "15px",
          }}
        >
          <a
            href="#como-funciona"
            style={{ color: "#374151", textDecoration: "none" }}
          >
            Cómo funciona
          </a>

          <a
            href="#convocatorias"
            style={{ color: "#374151", textDecoration: "none" }}
          >
            Convocatorias
          </a>

          <button
            style={{
              border: "1px solid #d1d5db",
              background: "white",
              padding: "10px 18px",
              borderRadius: "10px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Iniciar sesión
          </button>
        </nav>
      </header>

      <section
        style={{
          maxWidth: "1000px",
          margin: "0 auto",
          padding: "110px 32px 90px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "inline-block",
            background: "#dbeafe",
            color: "#1d4ed8",
            padding: "8px 14px",
            borderRadius: "999px",
            fontSize: "14px",
            fontWeight: 600,
            marginBottom: "28px",
          }}
        >
          Estimaciones basadas en datos oficiales
        </div>

        <h1
          style={{
            fontSize: "64px",
            lineHeight: 1.05,
            letterSpacing: "-3px",
            margin: "0 0 26px",
          }}
        >
          ¿Qué posibilidades tienes de conseguir plaza?
        </h1>

        <p
          style={{
            maxWidth: "720px",
            margin: "0 auto 38px",
            fontSize: "21px",
            lineHeight: 1.6,
            color: "#4b5563",
          }}
        >
          Baremia analiza miles de datos oficiales y estima tu posición y tus
          posibilidades dentro del proceso selectivo para ayudarte a tomar decisiones.
        </p>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "14px",
            flexWrap: "wrap",
          }}
        >
          <button
            style={{
              border: "none",
              background: "#2563eb",
              color: "white",
              padding: "15px 24px",
              borderRadius: "12px",
              fontSize: "16px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Calcular mi posición estimada
          </button>

          <button
            style={{
              border: "1px solid #d1d5db",
              background: "white",
              color: "#111827",
              padding: "15px 24px",
              borderRadius: "12px",
              fontSize: "16px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Ver convocatorias disponibles
          </button>
        </div>

        <p
          style={{
            marginTop: "20px",
            color: "#6b7280",
            fontSize: "13px",
          }}
        >
          Las estimaciones de Baremia son orientativas y no sustituyen los
          resultados oficiales.
        </p>
      </section>

      <section
        id="como-funciona"
        style={{
          background: "white",
          borderTop: "1px solid #e5e7eb",
          borderBottom: "1px solid #e5e7eb",
          padding: "80px 32px",
        }}
      >
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "52px" }}>
            <h2
              style={{
                fontSize: "38px",
                letterSpacing: "-1.5px",
                marginBottom: "14px",
              }}
            >
              Entiende tu situación en tres pasos
            </h2>

            <p style={{ color: "#6b7280", fontSize: "18px" }}>
              Menos hojas de cálculo. Más claridad.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "22px",
            }}
          >
            {[
              {
                number: "01",
                title: "Selecciona tu convocatoria",
                text: "Elige el proceso selectivo y el listado que quieres analizar.",
              },
              {
                number: "02",
                title: "Introduce tus datos",
                text: "Añade tu puntuación o localiza tus datos dentro de los documentos disponibles.",
              },
              {
                number: "03",
                title: "Consulta tu estimación",
                text: "Obtén una posición aproximada y una explicación clara de tus opciones.",
              },
            ].map((item) => (
              <article
                key={item.number}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: "18px",
                  padding: "30px",
                  background: "#ffffff",
                }}
              >
                <span
                  style={{
                    color: "#2563eb",
                    fontWeight: 800,
                    fontSize: "14px",
                  }}
                >
                  {item.number}
                </span>

                <h3
                  style={{
                    fontSize: "21px",
                    margin: "18px 0 12px",
                  }}
                >
                  {item.title}
                </h3>

                <p
                  style={{
                    color: "#6b7280",
                    lineHeight: 1.6,
                    margin: 0,
                  }}
                >
                  {item.text}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="convocatorias"
        style={{
          maxWidth: "900px",
          margin: "0 auto",
          padding: "90px 32px",
          textAlign: "center",
        }}
      >
        <h2
          style={{
            fontSize: "38px",
            letterSpacing: "-1.5px",
            marginBottom: "16px",
          }}
        >
          Primera convocatoria en preparación
        </h2>

        <p
          style={{
            color: "#6b7280",
            fontSize: "18px",
            lineHeight: 1.6,
          }}
        >
          Estamos preparando el análisis de la OPE de Enfermería de la
          Comunidad de Madrid.
        </p>

        <button
          style={{
            marginTop: "20px",
            border: "none",
            background: "#111827",
            color: "white",
            padding: "14px 22px",
            borderRadius: "12px",
            fontSize: "15px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Avisarme cuando esté disponible
        </button>
      </section>

      <footer
        style={{
          borderTop: "1px solid #e5e7eb",
          padding: "28px 32px",
          textAlign: "center",
          color: "#6b7280",
          fontSize: "14px",
        }}
      >
        © 2026 Baremia · Estimaciones inteligentes para opositores
      </footer>
    </main>
  );
}
