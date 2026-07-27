"use client";

import { FormEvent, useState } from "react";
import Header from "../../../components/Header";
import Footer from "../../../components/Footer";

export default function EnfermeriaMadridPage() {
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanQuery = query.trim();

    if (cleanQuery.length < 4) {
      setMessage("Introduce al menos 4 caracteres para realizar la búsqueda.");
      return;
    }

    setMessage(
      "La búsqueda todavía no está conectada a los listados oficiales. En el siguiente paso conectaremos esta pantalla con la base de datos."
    );
  }

  return (
    <>
      <Header />

      <main
        style={{
          minHeight: "72vh",
          background: "#f7f8fc",
          padding: "72px 24px 100px",
        }}
      >
        <section
          style={{
            width: "100%",
            maxWidth: "900px",
            margin: "0 auto",
          }}
        >
          <a
            href="/convocatorias"
            style={{
              display: "inline-block",
              marginBottom: "32px",
              color: "#2563eb",
              fontSize: "15px",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            ← Volver a convocatorias
          </a>

          <div
            style={{
              maxWidth: "760px",
              marginBottom: "38px",
            }}
          >
            <p
              style={{
                margin: "0 0 12px",
                color: "#2563eb",
                fontSize: "14px",
                fontWeight: 800,
              }}
            >
              OPE DE ENFERMERÍA · COMUNIDAD DE MADRID
            </p>

            <h1
              style={{
                margin: 0,
                color: "#0f172a",
                fontSize: "clamp(40px, 6vw, 62px)",
                lineHeight: 1.05,
                letterSpacing: "-2px",
              }}
            >
              Localízate en los listados oficiales
            </h1>

            <p
              style={{
                margin: "22px 0 0",
                color: "#64748b",
                fontSize: "19px",
                lineHeight: 1.7,
              }}
            >
              Introduce tu nombre completo o tu DNI para comprobar si apareces
              en los documentos publicados del proceso selectivo.
            </p>
          </div>

          <div
            style={{
              padding: "34px",
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "20px",
              boxShadow: "0 14px 40px rgba(15, 23, 42, 0.06)",
            }}
          >
            <form onSubmit={handleSubmit}>
              <label
                htmlFor="candidate-search"
                style={{
                  display: "block",
                  marginBottom: "10px",
                  color: "#0f172a",
                  fontSize: "16px",
                  fontWeight: 700,
                }}
              >
                Nombre completo o DNI
              </label>

              <input
                id="candidate-search"
                name="candidate-search"
                type="text"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setMessage("");
                }}
                placeholder="Ejemplo: Rafael García López o 12345678A"
                autoComplete="off"
                style={{
                  width: "100%",
                  minHeight: "56px",
                  padding: "0 16px",
                  color: "#0f172a",
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "12px",
                  fontSize: "16px",
                  outline: "none",
                }}
              />

              <p
                style={{
                  margin: "10px 0 0",
                  color: "#64748b",
                  fontSize: "14px",
                  lineHeight: 1.5,
                }}
              >
                Utiliza los mismos datos con los que apareces en los listados
                oficiales.
              </p>

              <button
                type="submit"
                style={{
                  width: "100%",
                  minHeight: "54px",
                  marginTop: "24px",
                  padding: "0 22px",
                  color: "#ffffff",
                  background: "#2563eb",
                  border: "none",
                  borderRadius: "12px",
                  fontSize: "16px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Buscar en los listados
              </button>
            </form>

            {message && (
              <div
                role="status"
                style={{
                  marginTop: "22px",
                  padding: "16px",
                  color: "#334155",
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  borderRadius: "12px",
                  fontSize: "15px",
                  lineHeight: 1.6,
                }}
              >
                {message}
              </div>
            )}

            <div
              style={{
                marginTop: "28px",
                paddingTop: "24px",
                borderTop: "1px solid #e2e8f0",
              }}
            >
              <p
                style={{
                  margin: 0,
                  color: "#0f172a",
                  fontSize: "15px",
                  fontWeight: 700,
                }}
              >
                Consulta privada
              </p>

              <p
                style={{
                  margin: "7px 0 0",
                  color: "#64748b",
                  fontSize: "14px",
                  lineHeight: 1.6,
                }}
              >
                Baremia no mostrará públicamente puntuaciones, posiciones ni
                datos completos de otras personas.
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
