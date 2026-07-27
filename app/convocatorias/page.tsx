import Link from "next/link";
import Header from "../../components/Header";
import Footer from "../../components/Footer";

export default function ConvocatoriasPage() {
  return (
    <>
      <Header />

      <main
        style={{
          minHeight: "70vh",
          background: "#f7f8fc",
          padding: "80px 24px 100px",
        }}
      >
        <section
          style={{
            width: "100%",
            maxWidth: "1100px",
            margin: "0 auto",
          }}
        >
          <div
            style={{
              maxWidth: "720px",
              marginBottom: "48px",
            }}
          >
            <p
              style={{
                marginBottom: "14px",
                color: "#2563eb",
                fontSize: "14px",
                fontWeight: 700,
              }}
            >
              CONVOCATORIAS
            </p>

            <h1
              style={{
                margin: 0,
                color: "#0f172a",
                fontSize: "clamp(40px, 6vw, 64px)",
                lineHeight: 1.05,
                letterSpacing: "-2px",
              }}
            >
              Consulta tu posición en los listados oficiales
            </h1>

            <p
              style={{
                marginTop: "22px",
                color: "#64748b",
                fontSize: "19px",
                lineHeight: 1.7,
              }}
            >
              Selecciona el proceso en el que participas. Solo necesitarás tu
              nombre o identificación para localizarte en los documentos
              oficiales.
            </p>
          </div>

          <article
            style={{
              display: "grid",
              gap: "28px",
              padding: "34px",
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "20px",
              boxShadow: "0 14px 40px rgba(15, 23, 42, 0.06)",
            }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "22px",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    padding: "7px 12px",
                    color: "#166534",
                    background: "#dcfce7",
                    borderRadius: "999px",
                    fontSize: "13px",
                    fontWeight: 700,
                  }}
                >
                  Disponible
                </span>

                <span
                  style={{
                    color: "#64748b",
                    fontSize: "14px",
                    fontWeight: 600,
                  }}
                >
                  Datos oficiales
                </span>
              </div>

              <p
                style={{
                  margin: 0,
                  color: "#2563eb",
                  fontSize: "15px",
                  fontWeight: 700,
                }}
              >
                Comunidad de Madrid
              </p>

              <h2
                style={{
                  margin: "8px 0 14px",
                  color: "#0f172a",
                  fontSize: "32px",
                  letterSpacing: "-1px",
                }}
              >
                OPE de Enfermería
              </h2>

              <p
                style={{
                  maxWidth: "720px",
                  margin: 0,
                  color: "#64748b",
                  fontSize: "17px",
                  lineHeight: 1.7,
                }}
              >
                Localízate en los listados publicados y accede a una estimación
                privada de tu posición dentro del proceso selectivo.
              </p>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "20px",
                paddingTop: "24px",
                borderTop: "1px solid #e2e8f0",
              }}
            >
              <div>
                <p
                  style={{
                    margin: 0,
                    color: "#0f172a",
                    fontWeight: 700,
                  }}
                >
                  Consulta privada
                </p>

                <p
                  style={{
                    margin: "5px 0 0",
                    color: "#64748b",
                    fontSize: "14px",
                  }}
                >
                  No mostraremos datos completos antes de verificar el acceso.
                </p>
              </div>

              <Link
                href="/convocatorias/enfermeria-madrid"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: "52px",
                  padding: "0 24px",
                  color: "#ffffff",
                  background: "#2563eb",
                  borderRadius: "12px",
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                Buscarme en los listados
              </Link>
            </div>
          </article>
        </section>
      </main>

      <Footer />
    </>
  );
}
