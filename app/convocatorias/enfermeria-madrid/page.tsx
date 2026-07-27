"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import Header from "../../../components/Header";
import Footer from "../../../components/Footer";

type SearchStatus =
  | "idle"
  | "searching"
  | "found"
  | "checkout"
  | "result";

export default function EnfermeriaMadridPage() {
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<SearchStatus>("idle");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanQuery = query.trim();

    if (cleanQuery.length < 4) {
      setMessage("Introduce al menos 4 caracteres para realizar la búsqueda.");
      setStatus("idle");
      return;
    }

    setMessage("");
    setStatus("searching");

    window.setTimeout(() => {
      setStatus("found");
    }, 900);
  }

  function resetSearch() {
    setQuery("");
    setMessage("");
    setStatus("idle");
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
          <Link
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
          </Link>

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
              {status === "found"
                ? "Registro localizado"
                : "Localízate en los listados oficiales"}
            </h1>

            <p
              style={{
                margin: "22px 0 0",
                color: "#64748b",
                fontSize: "19px",
                lineHeight: 1.7,
              }}
            >
              {status === "found"
                ? "Hemos encontrado una coincidencia compatible con los datos introducidos."
                : "Introduce tu nombre completo o tu DNI para comprobar si apareces en los documentos publicados del proceso selectivo."}
            </p>
          </div>

          {status !== "found" && (
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
                  disabled={status === "searching"}
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
                    background:
                      status === "searching" ? "#f8fafc" : "#ffffff",
                    border: "1px solid #cbd5e1",
                    borderRadius: "12px",
                    fontSize: "16px",
                    outline: "none",
                    boxSizing: "border-box",
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
                  disabled={status === "searching"}
                  style={{
                    width: "100%",
                    minHeight: "54px",
                    marginTop: "24px",
                    padding: "0 22px",
                    color: "#ffffff",
                    background:
                      status === "searching" ? "#64748b" : "#2563eb",
                    border: "none",
                    borderRadius: "12px",
                    fontSize: "16px",
                    fontWeight: 800,
                    cursor:
                      status === "searching" ? "not-allowed" : "pointer",
                  }}
                >
                  {status === "searching"
                    ? "Buscando coincidencias..."
                    : "Buscar en los listados"}
                </button>
              </form>

              {status === "searching" && (
                <div
                  role="status"
                  style={{
                    marginTop: "22px",
                    padding: "16px",
                    color: "#1e3a8a",
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    borderRadius: "12px",
                    fontSize: "15px",
                    lineHeight: 1.6,
                  }}
                >
                  Estamos comprobando los documentos asociados a esta
                  convocatoria.
                </div>
              )}

              {message && (
                <div
                  role="alert"
                  style={{
                    marginTop: "22px",
                    padding: "16px",
                    color: "#991b1b",
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
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
          )}

          {status === "found" && (
            <div
              style={{
                padding: "34px",
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "20px",
                boxShadow: "0 14px 40px rgba(15, 23, 42, 0.06)",
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  marginBottom: "24px",
                  padding: "8px 13px",
                  color: "#166534",
                  background: "#dcfce7",
                  borderRadius: "999px",
                  fontSize: "14px",
                  fontWeight: 800,
                }}
              >
                Coincidencia encontrada
              </div>

              <div
                style={{
                  display: "grid",
                  gap: "18px",
                }}
              >
                <div>
                  <p
                    style={{
                      margin: "0 0 5px",
                      color: "#64748b",
                      fontSize: "13px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                    }}
                  >
                    Candidato
                  </p>

                  <p
                    style={{
                      margin: 0,
                      color: "#0f172a",
                      fontSize: "20px",
                      fontWeight: 800,
                    }}
                  >
                    Registro compatible con «{query.trim()}»
                  </p>
                </div>

                <div>
                  <p
                    style={{
                      margin: "0 0 5px",
                      color: "#64748b",
                      fontSize: "13px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                    }}
                  >
                    Convocatoria
                  </p>

                  <p
                    style={{
                      margin: 0,
                      color: "#0f172a",
                      fontSize: "17px",
                      fontWeight: 700,
                    }}
                  >
                    OPE de Enfermería · Comunidad de Madrid
                  </p>
                </div>

                <div>
                  <p
                    style={{
                      margin: "0 0 5px",
                      color: "#64748b",
                      fontSize: "13px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                    }}
                  >
                    Estado
                  </p>

                  <p
                    style={{
                      margin: 0,
                      color: "#334155",
                      fontSize: "17px",
                    }}
                  >
                    Registro localizado en los listados del proceso
                  </p>
                </div>
              </div>

              <div
                style={{
                  marginTop: "28px",
                  padding: "18px",
                  color: "#334155",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "12px",
                  fontSize: "14px",
                  lineHeight: 1.6,
                }}
              >
                Esta pantalla utiliza actualmente una coincidencia simulada.
                Todavía no está conectada a los documentos oficiales.
              </div>

         <button
  type="button"
  onClick={() => setStatus("checkout")}
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
  Continuar con mi consulta
</button>

              <button
                type="button"
                onClick={() => setStatus("checkout")}
                style={{
                  width: "100%",
                  minHeight: "50px",
                  marginTop: "12px",
                  padding: "0 22px",
                  color: "#334155",
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "12px",
                  fontSize: "15px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Buscar con otros datos
              </button>

              <p
                style={{
                  margin: "20px 0 0",
                  color: "#64748b",
                  fontSize: "13px",
                  lineHeight: 1.6,
                  textAlign: "center",
                }}
              >
                La coincidencia deberá verificarse antes de mostrar cualquier
                información privada.
              </p>
            </div>
          )}
                    {status === "checkout" && (
            <div
              style={{
                padding: "34px",
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "20px",
                boxShadow: "0 14px 40px rgba(15, 23, 42, 0.06)",
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  marginBottom: "22px",
                  padding: "8px 13px",
                  color: "#1e40af",
                  background: "#dbeafe",
                  borderRadius: "999px",
                  fontSize: "14px",
                  fontWeight: 800,
                }}
              >
                Consulta preparada
              </div>

              <h2
                style={{
                  margin: 0,
                  color: "#0f172a",
                  fontSize: "32px",
                  lineHeight: 1.2,
                  letterSpacing: "-1px",
                }}
              >
                Desbloquea tu análisis privado
              </h2>

              <p
                style={{
                  margin: "16px 0 0",
                  color: "#64748b",
                  fontSize: "17px",
                  lineHeight: 1.7,
                }}
              >
                Tu acceso quedará vinculado al registro localizado para que
                puedas consultar futuras actualizaciones de esta convocatoria.
              </p>

              <div
                style={{
                  display: "grid",
                  gap: "16px",
                  marginTop: "28px",
                  padding: "22px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "14px",
                }}
              >
                <div>
                  <p
                    style={{
                      margin: "0 0 5px",
                      color: "#64748b",
                      fontSize: "13px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                    }}
                  >
                    Registro
                  </p>

                  <p
                    style={{
                      margin: 0,
                      color: "#0f172a",
                      fontSize: "17px",
                      fontWeight: 800,
                    }}
                  >
                    {query.trim()}
                  </p>
                </div>

                <div>
                  <p
                    style={{
                      margin: "0 0 5px",
                      color: "#64748b",
                      fontSize: "13px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                    }}
                  >
                    Convocatoria
                  </p>

                  <p
                    style={{
                      margin: 0,
                      color: "#0f172a",
                      fontSize: "17px",
                      fontWeight: 700,
                    }}
                  >
                    OPE de Enfermería · Comunidad de Madrid
                  </p>
                </div>
              </div>

              <div
                style={{
                  marginTop: "24px",
                  padding: "18px",
                  color: "#334155",
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  borderRadius: "12px",
                  fontSize: "14px",
                  lineHeight: 1.6,
                }}
              >
                El pago todavía no está conectado. Esta pantalla representa el
                paso previo al acceso privado.
              </div>

              <button
                type="button"
                style={{
                  width: "100%",
                  minHeight: "56px",
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
                Desbloquear mi análisis
              </button>

              <button
                type="button"
onClick={() => setStatus("result")}
                style={{
                  width: "100%",
                  minHeight: "50px",
                  marginTop: "12px",
                  padding: "0 22px",
                  color: "#334155",
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "12px",
                  fontSize: "15px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Volver a la coincidencia
              </button>

              <p
                style={{
                  margin: "20px 0 0",
                  color: "#64748b",
                  fontSize: "13px",
                  lineHeight: 1.6,
                  textAlign: "center",
                }}
              >
                No se mostrará información de otros participantes.
              </p>
            </div>
          )}
       {status === "result" && (
  <div
    style={{
      padding: "34px",
      background: "#ffffff",
      border: "1px solid #e2e8f0",
      borderRadius: "20px",
      boxShadow: "0 14px 40px rgba(15, 23, 42, 0.06)",
    }}
  >
    <div
      style={{
        display: "inline-flex",
        marginBottom: "22px",
        padding: "8px 13px",
        color: "#166534",
        background: "#dcfce7",
        borderRadius: "999px",
        fontSize: "14px",
        fontWeight: 800,
      }}
    >
      Análisis desbloqueado
    </div>

    <h2
      style={{
        margin: 0,
        color: "#0f172a",
        fontSize: "32px",
        lineHeight: 1.2,
        letterSpacing: "-1px",
      }}
    >
      Tu estimación de posición
    </h2>

    <p
      style={{
        margin: "16px 0 0",
        color: "#64748b",
        fontSize: "17px",
        lineHeight: 1.7,
      }}
    >
      Este resultado es una simulación visual. Todavía no está calculado a
      partir de los listados oficiales.
    </p>

    <div
      style={{
        marginTop: "28px",
        padding: "26px",
        background: "#eff6ff",
        border: "1px solid #bfdbfe",
        borderRadius: "16px",
        textAlign: "center",
      }}
    >
      <p
        style={{
          margin: 0,
          color: "#1e3a8a",
          fontSize: "14px",
          fontWeight: 800,
          textTransform: "uppercase",
        }}
      >
        Posición estimada
      </p>

      <p
        style={{
          margin: "10px 0 0",
          color: "#0f172a",
          fontSize: "48px",
          fontWeight: 900,
          letterSpacing: "-2px",
        }}
      >
        1.248
      </p>

      <p
        style={{
          margin: "8px 0 0",
          color: "#475569",
          fontSize: "15px",
        }}
      >
        de aproximadamente 8.400 participantes
      </p>
    </div>

    <div
      style={{
        display: "grid",
        gap: "14px",
        marginTop: "24px",
      }}
    >
      <div
        style={{
          padding: "18px",
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
        }}
      >
        <p
          style={{
            margin: "0 0 5px",
            color: "#64748b",
            fontSize: "13px",
            fontWeight: 700,
            textTransform: "uppercase",
          }}
        >
          Registro consultado
        </p>

        <p
          style={{
            margin: 0,
            color: "#0f172a",
            fontSize: "17px",
            fontWeight: 800,
          }}
        >
          {query.trim()}
        </p>
      </div>

      <div
        style={{
          padding: "18px",
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
        }}
      >
        <p
          style={{
            margin: "0 0 5px",
            color: "#64748b",
            fontSize: "13px",
            fontWeight: 700,
            textTransform: "uppercase",
          }}
        >
          Convocatoria
        </p>

        <p
          style={{
            margin: 0,
            color: "#0f172a",
            fontSize: "17px",
            fontWeight: 700,
          }}
        >
          OPE de Enfermería · Comunidad de Madrid
        </p>
      </div>
    </div>

    <div
      style={{
        marginTop: "24px",
        padding: "18px",
        color: "#92400e",
        background: "#fffbeb",
        border: "1px solid #fde68a",
        borderRadius: "12px",
        fontSize: "14px",
        lineHeight: 1.6,
      }}
    >
      La cifra mostrada es ficticia y solo sirve para probar el recorrido de la
      web.
    </div>

    <button
      type="button"
      onClick={resetSearch}
      style={{
        width: "100%",
        minHeight: "52px",
        marginTop: "24px",
        padding: "0 22px",
        color: "#334155",
        background: "#ffffff",
        border: "1px solid #cbd5e1",
        borderRadius: "12px",
        fontSize: "15px",
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      Realizar otra consulta
    </button>
  </div>
)}
        </section>
      </main>

      <Footer />
    </>
  );
}
