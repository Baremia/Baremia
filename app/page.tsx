"use client";

import { FormEvent, useState } from "react";

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
  probabilidad_plaza: number | null;
  comentario: string | null;
  fecha_calculo: string | null;
};

type Estado =
  | "inicio"
  | "buscando"
  | "candidato_encontrado"
  | "activando"
  | "consultando"
  | "sin_estimacion"
  | "estimacion_disponible"
  | "error";

async function leerJson(response: Response) {
  const texto = await response.text();

  try {
    return texto ? JSON.parse(texto) : {};
  } catch {
    return {
      ok: false,
      error: "El servidor devolvió una respuesta no válida",
      detalle: texto,
    };
  }
}

export default function Home() {
  const [nombre, setNombre] = useState("");
  const [dni, setDni] = useState("");

  const [estado, setEstado] = useState<Estado>("inicio");
  const [mensaje, setMensaje] = useState("");
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [candidatoSeleccionado, setCandidatoSeleccionado] =
    useState<Candidato | null>(null);

  const [codigoAcceso, setCodigoAcceso] = useState("");
  const [estimacion, setEstimacion] = useState<Estimacion | null>(null);

  const cargando =
    estado === "buscando" ||
    estado === "activando" ||
    estado === "consultando";

  async function buscarCandidato(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setEstado("buscando");
    setMensaje("");
    setCandidatos([]);
    setCandidatoSeleccionado(null);
    setCodigoAcceso("");
    setEstimacion(null);

    try {
      const response = await fetch("/api/buscar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
  nombre: nombre.trim(),
  dni: dni.trim(),
  convocatoria_id: "58ef068a-2176-4466-b959-fe678334e13c",
  }),
});

      const data = await leerJson(response);

      if (!response.ok || !data.ok) {
        throw new Error(
          data.detalle || data.error || "No se pudo realizar la búsqueda"
        ;
      }

      const resultados: Candidato[] = Array.isArray(data.candidatos)
        ? data.candidatos
        : [];

      if (!data.encontrado || resultados.length === 0) {
        setEstado("inicio");
        setMensaje(
          "No hemos encontrado ningún candidato con esos datos."
        );
        return;
      }

      setCandidatos(resultados);

      if (resultados.length === 1) {
        setCandidatoSeleccionado(resultados[0]);
      }

      setEstado("candidato_encontrado");
      setMensaje(
        resultados.length === 1
          ? "Candidato encontrado."
          : "Selecciona el candidato correcto."
      );
    } catch (error) {
      setEstado("error");
      setMensaje(
        error instanceof Error
          ? error.message
          : "Se produjo un error durante la búsqueda"
      );
    }
  }

  async function activarYEntrar() {
    if (!candidatoSeleccionado) {
      setEstado("error");
      setMensaje("Primero debes seleccionar un candidato.");
      return;
    }

    setEstado("activando");
    setMensaje("Simulando pago y preparando el acceso...");
    setCodigoAcceso("");
    setEstimacion(null);

    try {
      // 1. Simular pago y generar acceso
      const responseActivacion = await fetch("/api/dev/activar-acceso", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          candidato_id: candidatoSeleccionado.candidato_id,
        }),
      });

      const activacion = await leerJson(responseActivacion);

      if (!responseActivacion.ok || !activacion.ok) {
        throw new Error(
          activacion.detalle ||
            activacion.error ||
            "No se pudo activar el acceso"
        );
      }

      if (!activacion.codigo_acceso) {
        throw new Error("No se recibió el código de acceso.");
      }

      setCodigoAcceso(activacion.codigo_acceso);

      // 2. Validar el código generado
      const responseValidacion = await fetch("/api/validar-acceso", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          candidato_id: candidatoSeleccionado.candidato_id,
          codigo: activacion.codigo_acceso,
        }),
      });

      const validacion = await leerJson(responseValidacion);

      if (
        !responseValidacion.ok ||
        !validacion.ok ||
        !validacion.autenticado ||
        !validacion.acceso_id
      ) {
        throw new Error(
          validacion.mensaje ||
            validacion.error ||
            "El acceso no pudo validarse"
        );
      }

      // 3. Crear sesión y recibir cookie HttpOnly
      const responseSesion = await fetch("/api/sesion", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          acceso_id: validacion.acceso_id,
        }),
      });

      const sesion = await leerJson(responseSesion);

      if (!responseSesion.ok || !sesion.ok) {
        throw new Error(
          sesion.detalle || sesion.error || "No se pudo crear la sesión"
        );
      }

      // 4. Consultar automáticamente la estimación
      await consultarEstimacion();
    } catch (error) {
      setEstado("error");
      setMensaje(
        error instanceof Error
          ? error.message
          : "No se pudo completar el acceso"
      );
    }
  }

  async function consultarEstimacion() {
    setEstado("consultando");
    setMensaje("Consultando la estimación...");

    try {
      const response = await fetch("/api/estimacion", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const data = await leerJson(response);

      if (!response.ok || !data.ok) {
        throw new Error(
          data.detalle || data.error || "No se pudo consultar la estimación"
        );
      }

      if (!data.encontrada || !data.estimacion) {
        setEstimacion(null);
        setEstado("sin_estimacion");
        setMensaje(
          data.mensaje || "Todavía no existe una estimación disponible."
        );
        return;
      }

      setEstimacion(data.estimacion);
      setEstado("estimacion_disponible");
      setMensaje("Estimación obtenida correctamente.");
    } catch (error) {
      setEstado("error");
      setMensaje(
        error instanceof Error
          ? error.message
          : "No se pudo consultar la estimación"
      );
    }
  }

  function reiniciar() {
    setNombre("");
    setDni("");
    setEstado("inicio");
    setMensaje("");
    setCandidatos([]);
    setCandidatoSeleccionado(null);
    setCodigoAcceso("");
    setEstimacion(null);
  }

  return (
    <main style={styles.main}>
      <section style={styles.container}>
        <header style={styles.header}>
          <div style={styles.logo}>B</div>

          <div>
            <h1 style={styles.title}>Baremia</h1>
            <p style={styles.subtitle}>
              Consulta tu posición estimada en procesos selectivos
            </p>
          </div>
        </header>

        <div style={styles.notice}>
          <strong>Entorno de desarrollo.</strong> El pago se simula para
          comprobar el funcionamiento completo de la plataforma.
        </div>

        <form onSubmit={buscarCandidato} style={styles.card}>
          <h2 style={styles.cardTitle}>Busca tu candidatura</h2>

          <label style={styles.label}>
            Nombre y apellidos
            <input
              style={styles.input}
              type="text"
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
              placeholder="Ejemplo: Rafael García"
              autoComplete="name"
              required
              disabled={cargando}
            />
          </label>

          <label style={styles.label}>
            DNI
            <input
              style={styles.input}
              type="text"
              value={dni}
              onChange={(event) =>
                setDni(event.target.value.toUpperCase())
              }
              placeholder="Ejemplo: 12345678A"
              autoComplete="off"
              required
              disabled={cargando}
            />
          </label>

          <button style={styles.primaryButton} disabled={cargando}>
            {estado === "buscando"
              ? "Buscando..."
              : "Buscar candidatura"}
          </button>
        </form>

        {candidatos.length > 0 && (
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>Resultado</h2>

            <div style={styles.candidateList}>
              {candidatos.map((candidato) => {
                const seleccionado =
                  candidatoSeleccionado?.candidato_id ===
                  candidato.candidato_id;

                return (
                  <button
                    key={candidato.candidato_id}
                    type="button"
                    onClick={() => setCandidatoSeleccionado(candidato)}
                    style={{
                      ...styles.candidateButton,
                      ...(seleccionado
                        ? styles.candidateButtonSelected
                        : {}),
                    }}
                    disabled={cargando}
                  >
                    <strong>{candidato.nombre}</strong>
                    <span>{candidato.dni_mostrado}</span>
                    <span>{candidato.convocatoria}</span>
                    <small>
                      Estado: {candidato.estado_convocatoria}
                    </small>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              style={styles.primaryButton}
              onClick={activarYEntrar}
              disabled={!candidatoSeleccionado || cargando}
            >
              {estado === "activando" || estado === "consultando"
                ? "Preparando consulta..."
                : "Simular pago y consultar"}
            </button>
          </section>
        )}

        {mensaje && (
          <section
            style={{
              ...styles.message,
              ...(estado === "error"
                ? styles.errorMessage
                : styles.normalMessage),
            }}
          >
            {mensaje}
          </section>
        )}

        {codigoAcceso && (
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>Código de acceso generado</h2>

            <p style={styles.code}>{codigoAcceso}</p>

            <p style={styles.helpText}>
              En producción, este código se mostrará una sola vez después
              del pago. El usuario deberá conservarlo para futuras consultas.
            </p>
          </section>
        )}

        {estado === "sin_estimacion" && (
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>Consulta activada</h2>

            <p style={styles.emptyTitle}>
              Todavía no hay una estimación disponible
            </p>

            <p style={styles.helpText}>
              La autenticación y la sesión funcionan correctamente. Solo
              falta incorporar una estimación para este candidato en la base
              de datos.
            </p>

            <button
              type="button"
              style={styles.secondaryButton}
              onClick={consultarEstimacion}
            >
              Volver a consultar
            </button>
          </section>
        )}

        {estado === "estimacion_disponible" && estimacion && (
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>
              Tu estimación
            </h2>

            <p style={styles.convocatoria}>
              {estimacion.convocatoria}
            </p>

            <div style={styles.metrics}>
              <article style={styles.metric}>
                <span style={styles.metricLabel}>
                  Posición estimada
                </span>
                <strong style={styles.metricValue}>
                  {estimacion.posicion_estimada ?? "—"}
                </strong>
              </article>

              <article style={styles.metric}>
                <span style={styles.metricLabel}>
                  Intervalo estimado
                </span>
                <strong style={styles.metricValueSmall}>
                  {estimacion.posicion_minima ?? "—"} –{" "}
                  {estimacion.posicion_maxima ?? "—"}
                </strong>
              </article>

              <article style={styles.metric}>
                <span style={styles.metricLabel}>
                  Probabilidad de plaza
                </span>
                <strong style={styles.metricValue}>
                  {estimacion.probabilidad_plaza !== null
                    ? `${estimacion.probabilidad_plaza}%`
                    : "—"}
                </strong>
              </article>
            </div>

            {estimacion.comentario && (
              <div style={styles.comment}>
                {estimacion.comentario}
              </div>
            )}

            {estimacion.fecha_calculo && (
              <p style={styles.helpText}>
                Última actualización:{" "}
                {new Date(
                  estimacion.fecha_calculo
                ).toLocaleString("es-ES")}
              </p>
            )}
          </section>
        )}

        {(candidatos.length > 0 ||
          codigoAcceso ||
          estimacion ||
          estado === "error") && (
          <button
            type="button"
            style={styles.resetButton}
            onClick={reiniciar}
            disabled={cargando}
          >
            Empezar de nuevo
          </button>
        )}
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: "100vh",
    background: "#f4f7fb",
    padding: "40px 16px",
    color: "#162033",
    fontFamily:
      "Arial, Helvetica, sans-serif",
  },
  container: {
    width: "100%",
    maxWidth: "720px",
    margin: "0 auto",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    marginBottom: "24px",
  },
  logo: {
    width: "52px",
    height: "52px",
    borderRadius: "14px",
    display: "grid",
    placeItems: "center",
    background: "#173b67",
    color: "white",
    fontSize: "28px",
    fontWeight: 800,
  },
  title: {
    margin: 0,
    fontSize: "32px",
  },
  subtitle: {
    margin: "6px 0 0",
    color: "#5e6b7c",
  },
  notice: {
    padding: "14px 16px",
    marginBottom: "18px",
    borderRadius: "12px",
    background: "#fff4d8",
    border: "1px solid #ead391",
    lineHeight: 1.5,
  },
  card: {
    background: "white",
    border: "1px solid #dfe6ef",
    borderRadius: "18px",
    padding: "24px",
    marginBottom: "18px",
    boxShadow: "0 8px 30px rgba(25, 50, 80, 0.06)",
  },
  cardTitle: {
    margin: "0 0 20px",
    fontSize: "21px",
  },
  label: {
    display: "block",
    marginBottom: "16px",
    fontWeight: 700,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    marginTop: "8px",
    padding: "13px 14px",
    border: "1px solid #bdc8d6",
    borderRadius: "10px",
    fontSize: "16px",
    background: "white",
    color: "#162033",
  },
  primaryButton: {
    width: "100%",
    border: 0,
    borderRadius: "11px",
    padding: "14px 18px",
    background: "#173b67",
    color: "white",
    fontSize: "16px",
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryButton: {
    width: "100%",
    border: "1px solid #173b67",
    borderRadius: "11px",
    padding: "13px 18px",
    marginTop: "16px",
    background: "white",
    color: "#173b67",
    fontSize: "16px",
    fontWeight: 700,
    cursor: "pointer",
  },
  candidateList: {
    display: "grid",
    gap: "12px",
    marginBottom: "18px",
  },
  candidateButton: {
    display: "grid",
    gap: "5px",
    width: "100%",
    padding: "16px",
    textAlign: "left",
    border: "1px solid #ccd6e2",
    borderRadius: "12px",
    background: "white",
    color: "#162033",
    cursor: "pointer",
  },
  candidateButtonSelected: {
    border: "2px solid #173b67",
    background: "#eef5fc",
  },
  message: {
    padding: "14px 16px",
    borderRadius: "12px",
    marginBottom: "18px",
    lineHeight: 1.5,
  },
  normalMessage: {
    background: "#eaf6ef",
    border: "1px solid #abd2ba",
  },
  errorMessage: {
    background: "#fdecec",
    border: "1px solid #e3aaaa",
    color: "#8e2020",
  },
  code: {
    padding: "16px",
    borderRadius: "10px",
    background: "#101828",
    color: "white",
    fontFamily: "monospace",
    fontSize: "18px",
    textAlign: "center",
    wordBreak: "break-all",
  },
  helpText: {
    color: "#5e6b7c",
    lineHeight: 1.6,
  },
  emptyTitle: {
    fontSize: "18px",
    fontWeight: 700,
  },
  convocatoria: {
    color: "#5e6b7c",
    marginTop: "-10px",
  },
  metrics: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: "12px",
    marginTop: "20px",
  },
  metric: {
    padding: "18px",
    borderRadius: "14px",
    background: "#f3f6fa",
    textAlign: "center",
  },
  metricLabel: {
    display: "block",
    marginBottom: "10px",
    color: "#5e6b7c",
    fontSize: "14px",
  },
  metricValue: {
    display: "block",
    fontSize: "30px",
  },
  metricValueSmall: {
    display: "block",
    fontSize: "23px",
  },
  comment: {
    marginTop: "18px",
    padding: "16px",
    borderLeft: "4px solid #173b67",
    background: "#f3f6fa",
    lineHeight: 1.6,
  },
  resetButton: {
    display: "block",
    margin: "10px auto 0",
    border: 0,
    background: "transparent",
    color: "#5e6b7c",
    textDecoration: "underline",
    cursor: "pointer",
  },
};
