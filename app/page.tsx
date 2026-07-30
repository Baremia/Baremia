"use client";

import {
  FormEvent,
  useState,
  type CSSProperties,
} from "react";

const CONVOCATORIA_ID =
  "58ef068a-2176-4466-b959-fe678334e13c";

type Candidato = {
  candidato_id: string;
  nombre: string;
  dni_mostrado: string;
  convocatoria_id: string;
  convocatoria: string;
  estado_convocatoria: string;
};

type Estimacion = {
  convocatoria: string;
  posicion_estimada: number | null;
  posicion_minima: number | null;
  posicion_maxima: number | null;
  probabilidad_plaza: number | string | null;
  comentario: string | null;
  fecha_calculo: string | null;
};

type Estado =
  | "inicio"
  | "buscando"
  | "resultado"
  | "activando"
  | "validando"
  | "consultando"
  | "sin_estimacion"
  | "estimacion"
  | "error";

async function leerJson(response: Response) {
  const texto = await response.text();

  if (!texto) {
    return {};
  }

  try {
    return JSON.parse(texto);
  } catch {
    return {
      ok: false,
      error: "El servidor devolvió una respuesta no válida",
      detalle: texto,
    };
  }
}

export default function Home() {
  const [busqueda, setBusqueda] = useState("");
  const [codigo, setCodigo] = useState("");

  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [candidato, setCandidato] = useState<Candidato | null>(null);
  const [estimacion, setEstimacion] = useState<Estimacion | null>(null);

  const [estado, setEstado] = useState<Estado>("inicio");
  const [mensaje, setMensaje] = useState("");

  const cargando =
    estado === "buscando" ||
    estado === "activando" ||
    estado === "validando" ||
    estado === "consultando";

  async function buscarCandidato(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const termino = busqueda.trim();

    if (termino.length < 3) {
      setEstado("error");
      setMensaje(
        "Introduce al menos tres caracteres del nombre o del DNI."
      );
      return;
    }

    setEstado("buscando");
    setMensaje("");
    setCandidatos([]);
    setCandidato(null);
    setEstimacion(null);
    setCodigo("");

    try {
      const response = await fetch("/api/buscar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          convocatoria_id: CONVOCATORIA_ID,
          busqueda: termino,
        }),
      });

      const data = await leerJson(response);

      if (!response.ok || !data.ok) {
        throw new Error(
          data.detalle ||
            data.error ||
            "No se pudo realizar la búsqueda"
        );
      }

      const resultados: Candidato[] = Array.isArray(
        data.candidatos
      )
        ? data.candidatos
        : [];

      if (resultados.length === 0) {
        setEstado("inicio");
        setMensaje(
          "No se ha encontrado ninguna candidatura con esos datos."
        );
        return;
      }

      setCandidatos(resultados);
      setCandidato(
        resultados.length === 1 ? resultados[0] : null
      );
      setEstado("resultado");

      setMensaje(
        resultados.length === 1
          ? "Candidatura encontrada."
          : "Selecciona la candidatura correcta."
      );
    } catch (error) {
      mostrarError(error, "No se pudo realizar la búsqueda");
    }
  }

  async function generarAccesoPrueba() {
    if (!candidato) {
      setEstado("error");
      setMensaje("Selecciona primero una candidatura.");
      return;
    }

    setEstado("activando");
    setMensaje("Generando el acceso de prueba...");

    try {
      const response = await fetch(
        "/api/dev/activar-acceso",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            candidato_id: candidato.candidato_id,
          }),
        }
      );

      const data = await leerJson(response);

      if (!response.ok || !data.ok) {
        throw new Error(
          data.detalle ||
            data.error ||
            "No se pudo generar el acceso"
        );
      }

      if (!data.codigo_acceso) {
        throw new Error(
          "El servidor no devolvió el código de acceso."
        );
      }

      setCodigo(data.codigo_acceso);

      await validarCodigo(data.codigo_acceso);
    } catch (error) {
      mostrarError(error, "No se pudo generar el acceso");
    }
  }

  async function accederConCodigo(
    event?: FormEvent<HTMLFormElement>
  ) {
    event?.preventDefault();

    await validarCodigo(codigo);
  }

  async function validarCodigo(codigoAValidar: string) {
    if (!candidato) {
      setEstado("error");
      setMensaje("Selecciona primero una candidatura.");
      return;
    }

    const codigoLimpio = codigoAValidar.trim().toUpperCase();

    if (!codigoLimpio) {
      setEstado("error");
      setMensaje("Introduce tu código de acceso.");
      return;
    }

    setCodigo(codigoLimpio);
    setEstado("validando");
    setMensaje("Validando el código...");

    try {
      const responseValidacion = await fetch(
        "/api/validar-acceso",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            candidato_id: candidato.candidato_id,
            codigo: codigoLimpio,
          }),
        }
      );

      const validacion = await leerJson(
        responseValidacion
      );

      if (
        !responseValidacion.ok ||
        !validacion.ok ||
        !validacion.autenticado ||
        !validacion.acceso_id
      ) {
        throw new Error(
          validacion.mensaje ||
            validacion.detalle ||
            validacion.error ||
            "El código no es válido"
        );
      }

      await crearSesion(validacion.acceso_id);
    } catch (error) {
      mostrarError(error, "No se pudo validar el código");
    }
  }

  async function crearSesion(accesoId: string) {
    setEstado("validando");
    setMensaje("Creando la sesión segura...");

    const response = await fetch("/api/sesion", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        acceso_id: accesoId,
      }),
    });

    const data = await leerJson(response);

    if (!response.ok || !data.ok) {
      throw new Error(
        data.detalle ||
          data.error ||
          "No se pudo crear la sesión"
      );
    }

    await consultarEstimacion();
  }

  async function consultarEstimacion() {
    setEstado("consultando");
    setMensaje("Consultando tu estimación...");

    try {
      const response = await fetch("/api/estimacion", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const data = await leerJson(response);

      if (!response.ok || !data.ok) {
        throw new Error(
          data.detalle ||
            data.error ||
            "No se pudo consultar la estimación"
        );
      }

      if (!data.encontrada || !data.estimacion) {
        setEstimacion(null);
        setEstado("sin_estimacion");
        setMensaje(
          data.mensaje ||
            "Todavía no existe una estimación disponible."
        );
        return;
      }

      setEstimacion(data.estimacion);
      setEstado("estimacion");
      setMensaje("Estimación obtenida correctamente.");
    } catch (error) {
      mostrarError(
        error,
        "No se pudo consultar la estimación"
      );
    }
  }

  function mostrarError(
    error: unknown,
    mensajePredeterminado: string
  ) {
    console.error(error);

    setEstado("error");
    setMensaje(
      error instanceof Error
        ? error.message
        : mensajePredeterminado
    );
  }

  function reiniciar() {
    setBusqueda("");
    setCodigo("");
    setCandidatos([]);
    setCandidato(null);
    setEstimacion(null);
    setEstado("inicio");
    setMensaje("");
  }

  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <header style={styles.header}>
          <div style={styles.logo}>B</div>

          <div>
            <h1 style={styles.title}>Baremia</h1>
            <p style={styles.subtitle}>
              Consulta tu posición estimada en la OPE
            </p>
          </div>
        </header>

        <div style={styles.developmentNotice}>
          <strong>Versión de desarrollo.</strong>{" "}
          Actualmente el pago se simula para comprobar el
          funcionamiento de la plataforma.
        </div>

        <section style={styles.card}>
          <h2 style={styles.cardTitle}>
            Busca tu candidatura
          </h2>

          <p style={styles.helpText}>
            Introduce tu nombre completo o tu DNI.
          </p>

          <form onSubmit={buscarCandidato}>
            <input
              type="text"
              value={busqueda}
              onChange={(event) =>
                setBusqueda(event.target.value)
              }
              placeholder="Rafael García o 12345678A"
              style={styles.input}
              disabled={cargando}
              autoComplete="off"
            />

            <button
              type="submit"
              style={styles.primaryButton}
              disabled={cargando}
            >
              {estado === "buscando"
                ? "Buscando..."
                : "Buscar candidatura"}
            </button>
          </form>
        </section>

        {candidatos.length > 0 && (
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>
              Candidatura encontrada
            </h2>

            <div style={styles.candidateList}>
              {candidatos.map((item) => {
                const seleccionado =
                  candidato?.candidato_id ===
                  item.candidato_id;

                return (
                  <button
                    key={item.candidato_id}
                    type="button"
                    onClick={() => setCandidato(item)}
                    disabled={cargando}
                    style={{
                      ...styles.candidate,
                      ...(seleccionado
                        ? styles.candidateSelected
                        : {}),
                    }}
                  >
                    <strong>{item.nombre}</strong>
                    <span>{item.dni_mostrado}</span>
                    <span>{item.convocatoria}</span>
                    <small>
                      Estado: {item.estado_convocatoria}
                    </small>
                  </button>
                );
              })}
            </div>

            {candidato && (
              <>
                <div style={styles.separator} />

                <h3 style={styles.sectionTitle}>
                  Acceso a la consulta
                </h3>

                <form onSubmit={accederConCodigo}>
                  <label style={styles.label}>
                    Código de acceso
                  </label>

                  <input
                    type="text"
                    value={codigo}
                    onChange={(event) =>
                      setCodigo(
                        event.target.value.toUpperCase()
                      )
                    }
                    placeholder="BRM-XXXX-XXXX-XXXX-XXXX"
                    style={styles.input}
                    disabled={cargando}
                    autoComplete="off"
                  />

                  <button
                    type="submit"
                    style={styles.primaryButton}
                    disabled={cargando || !codigo.trim()}
                  >
                    {estado === "validando"
                      ? "Validando..."
                      : "Acceder con mi código"}
                  </button>
                </form>

                <button
                  type="button"
                  onClick={generarAccesoPrueba}
                  style={styles.secondaryButton}
                  disabled={cargando}
                >
                  {estado === "activando"
                    ? "Generando..."
                    : "Simular pago y generar código"}
                </button>

                <p style={styles.smallText}>
                  El botón de simulación es temporal y será
                  sustituido por Stripe.
                </p>
              </>
            )}
          </section>
        )}

        {mensaje && (
          <div
            style={{
              ...styles.message,
              ...(estado === "error"
                ? styles.errorMessage
                : styles.successMessage),
            }}
          >
            {mensaje}
          </div>
        )}

        {codigo && estado !== "error" && (
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>
              Tu código de acceso
            </h2>

            <div style={styles.code}>{codigo}</div>

            <p style={styles.helpText}>
              Guarda este código. Será necesario para volver
              a consultar futuras actualizaciones.
            </p>
          </section>
        )}

        {estado === "sin_estimacion" && (
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>
              Acceso correcto
            </h2>

            <p style={styles.emptyTitle}>
              Todavía no hay una estimación disponible
            </p>

            <p style={styles.helpText}>
              La candidatura, el código y la sesión se han
              validado correctamente. Ahora falta incorporar
              una estimación a la base de datos.
            </p>

            <button
              type="button"
              onClick={consultarEstimacion}
              style={styles.secondaryButton}
            >
              Volver a consultar
            </button>
          </section>
        )}

        {estado === "estimacion" && estimacion && (
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>
              Tu estimación
            </h2>

            <p style={styles.helpText}>
              {estimacion.convocatoria}
            </p>

            <div style={styles.metrics}>
              <div style={styles.metric}>
                <span style={styles.metricLabel}>
                  Posición estimada
                </span>
                <strong style={styles.metricValue}>
                  {estimacion.posicion_estimada ?? "—"}
                </strong>
              </div>

              <div style={styles.metric}>
                <span style={styles.metricLabel}>
                  Intervalo
                </span>
                <strong style={styles.metricValueSmall}>
                  {estimacion.posicion_minima ?? "—"} –{" "}
                  {estimacion.posicion_maxima ?? "—"}
                </strong>
              </div>

              <div style={styles.metric}>
                <span style={styles.metricLabel}>
                  Probabilidad de plaza
                </span>
                <strong style={styles.metricValue}>
                  {estimacion.probabilidad_plaza !== null
                    ? `${estimacion.probabilidad_plaza}%`
                    : "—"}
                </strong>
              </div>
            </div>

            {estimacion.comentario && (
              <div style={styles.comment}>
                {estimacion.comentario}
              </div>
            )}

            {estimacion.fecha_calculo && (
              <p style={styles.smallText}>
                Última actualización:{" "}
                {new Date(
                  estimacion.fecha_calculo
                ).toLocaleString("es-ES")}
              </p>
            )}
          </section>
        )}

        {(candidatos.length > 0 ||
          estado === "error" ||
          estado === "sin_estimacion" ||
          estado === "estimacion") && (
          <button
            type="button"
            onClick={reiniciar}
            style={styles.resetButton}
            disabled={cargando}
          >
            Empezar de nuevo
          </button>
        )}
      </div>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  main: {
    minHeight: "100vh",
    padding: "36px 16px",
    background: "#f3f6fa",
    color: "#172033",
    fontFamily: "Arial, Helvetica, sans-serif",
  },
  container: {
    width: "100%",
    maxWidth: "720px",
    margin: "0 auto",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "15px",
    marginBottom: "24px",
  },
  logo: {
    display: "grid",
    placeItems: "center",
    width: "54px",
    height: "54px",
    borderRadius: "15px",
    background: "#173b67",
    color: "#ffffff",
    fontSize: "29px",
    fontWeight: 800,
  },
  title: {
    margin: 0,
    fontSize: "32px",
  },
  subtitle: {
    margin: "5px 0 0",
    color: "#657084",
  },
  developmentNotice: {
    marginBottom: "18px",
    padding: "14px 16px",
    border: "1px solid #e0c779",
    borderRadius: "12px",
    background: "#fff5d8",
    lineHeight: 1.5,
  },
  card: {
    marginBottom: "18px",
    padding: "24px",
    border: "1px solid #dce3ec",
    borderRadius: "18px",
    background: "#ffffff",
    boxShadow: "0 8px 28px rgba(20, 45, 75, 0.06)",
  },
  cardTitle: {
    margin: "0 0 16px",
    fontSize: "21px",
  },
  sectionTitle: {
    margin: "0 0 14px",
    fontSize: "18px",
  },
  label: {
    display: "block",
    marginBottom: "8px",
    fontWeight: 700,
  },
  input: {
    boxSizing: "border-box",
    width: "100%",
    marginBottom: "13px",
    padding: "14px",
    border: "1px solid #b9c4d1",
    borderRadius: "11px",
    background: "#ffffff",
    color: "#172033",
    fontSize: "16px",
  },
  primaryButton: {
    width: "100%",
    padding: "14px 18px",
    border: 0,
    borderRadius: "11px",
    background: "#173b67",
    color: "#ffffff",
    fontSize: "16px",
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryButton: {
    width: "100%",
    marginTop: "12px",
    padding: "13px 18px",
    border: "1px solid #173b67",
    borderRadius: "11px",
    background: "#ffffff",
    color: "#173b67",
    fontSize: "16px",
    fontWeight: 700,
    cursor: "pointer",
  },
  candidateList: {
    display: "grid",
    gap: "11px",
  },
  candidate: {
    display: "grid",
    gap: "5px",
    width: "100%",
    padding: "16px",
    border: "1px solid #c7d1dd",
    borderRadius: "12px",
    background: "#ffffff",
    color: "#172033",
    textAlign: "left",
    cursor: "pointer",
  },
  candidateSelected: {
    border: "2px solid #173b67",
    background: "#edf4fb",
  },
  separator: {
    height: "1px",
    margin: "22px 0",
    background: "#dfe5ec",
  },
  message: {
    marginBottom: "18px",
    padding: "14px 16px",
    borderRadius: "12px",
    lineHeight: 1.5,
  },
  successMessage: {
    border: "1px solid #a9d0b6",
    background: "#eaf6ee",
  },
  errorMessage: {
    border: "1px solid #e2aaaa",
    background: "#fdecec",
    color: "#8e2020",
  },
  code: {
    padding: "17px",
    borderRadius: "11px",
    background: "#101828",
    color: "#ffffff",
    fontFamily: "monospace",
    fontSize: "18px",
    textAlign: "center",
    wordBreak: "break-word",
  },
  helpText: {
    color: "#657084",
    lineHeight: 1.6,
  },
  smallText: {
    marginBottom: 0,
    color: "#657084",
    fontSize: "13px",
    lineHeight: 1.5,
  },
  emptyTitle: {
    fontSize: "18px",
    fontWeight: 700,
  },
  metrics: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(165px, 1fr))",
    gap: "12px",
    marginTop: "20px",
  },
  metric: {
    padding: "18px",
    borderRadius: "14px",
    background: "#f2f5f9",
    textAlign: "center",
  },
  metricLabel: {
    display: "block",
    marginBottom: "10px",
    color: "#657084",
    fontSize: "14px",
  },
  metricValue: {
    display: "block",
    fontSize: "30px",
  },
  metricValueSmall: {
    display: "block",
    fontSize: "22px",
  },
  comment: {
    marginTop: "18px",
    padding: "16px",
    borderLeft: "4px solid #173b67",
    background: "#f2f5f9",
    lineHeight: 1.6,
  },
  resetButton: {
    display: "block",
    margin: "8px auto 0",
    border: 0,
    background: "transparent",
    color: "#657084",
    textDecoration: "underline",
    cursor: "pointer",
  },
};
