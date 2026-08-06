"use client";

import { FormEvent, useMemo, useState, type CSSProperties } from "react";

const CONVOCATORIA_ID = "15b496e6-f85e-403e-9270-0f3fb4d43bfc";

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
  puntuacion_oposicion: number | string | null;
  meritos_estimados: number | string | null;
  puntuacion_total_estimada: number | string | null;
  nivel_confianza: string | null;
  metodo_estimacion: string | null;
  datos_modelo: {
    plazas_aplicables?: number;
    cupo?: string;
    coincidencia_bolsa?: boolean;
    fecha_corte_bolsa?: string;
    nota?: string;
  } | null;
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

type ApiPayload = Record<string, any>;

async function leerJson(response: Response): Promise<ApiPayload> {
  const texto = await response.text();
  if (!texto) return {};

  try {
    return JSON.parse(texto) as ApiPayload;
  } catch {
    return {
      ok: false,
      error: "El servidor devolvió una respuesta no válida",
      detalle: texto.slice(0, 300),
    };
  }
}

function numero(value: number | string | null, digits = 3) {
  if (value === null || value === "") return "—";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return String(value);

  return new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: digits,
  }).format(parsed);
}

function entero(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("es-ES").format(value);
}

function confianzaLabel(value: string | null) {
  const labels: Record<string, string> = {
    alta: "Alta",
    media: "Media",
    baja: "Baja",
  };
  return value ? labels[value] ?? value : "No disponible";
}

export default function Home() {
  const [busqueda, setBusqueda] = useState("");
  const [codigo, setCodigo] = useState("");
  const [codigoCopiado, setCodigoCopiado] = useState(false);
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [candidato, setCandidato] = useState<Candidato | null>(null);
  const [estimacion, setEstimacion] = useState<Estimacion | null>(null);
  const [estado, setEstado] = useState<Estado>("inicio");
  const [mensaje, setMensaje] = useState("");

  const cargando = ["buscando", "activando", "validando", "consultando"].includes(estado);

  const esCruceDirecto = estimacion?.datos_modelo?.coincidencia_bolsa === true;
  const confianza = confianzaLabel(estimacion?.nivel_confianza ?? null);

  const fechaCalculo = useMemo(() => {
    if (!estimacion?.fecha_calculo) return null;
    const date = new Date(estimacion.fecha_calculo);
    return Number.isNaN(date.getTime())
      ? estimacion.fecha_calculo
      : new Intl.DateTimeFormat("es-ES", {
          dateStyle: "long",
          timeStyle: "short",
        }).format(date);
  }, [estimacion?.fecha_calculo]);

  async function buscarCandidato(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const termino = busqueda.trim();

    if (termino.length < 3) {
      setEstado("error");
      setMensaje("Introduce al menos tres caracteres del nombre o del DNI.");
      return;
    }

    setEstado("buscando");
    setMensaje("");
    setCandidatos([]);
    setCandidato(null);
    setEstimacion(null);
    setCodigo("");
    setCodigoCopiado(false);

    try {
      const response = await fetch("/api/buscar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          convocatoria_id: CONVOCATORIA_ID,
          busqueda: termino,
        }),
      });
      const data = await leerJson(response);

      if (!response.ok || !data.ok) {
        throw new Error(data.detalle || data.error || "No se pudo realizar la búsqueda");
      }

      const resultados: Candidato[] = Array.isArray(data.candidatos) ? data.candidatos : [];
      if (resultados.length === 0) {
        setEstado("inicio");
        setMensaje("No se ha encontrado ninguna candidatura con esos datos.");
        return;
      }

      setCandidatos(resultados);
      setCandidato(resultados.length === 1 ? resultados[0] : null);
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
      const response = await fetch("/api/dev/activar-acceso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidato_id: candidato.candidato_id }),
      });
      const data = await leerJson(response);

      if (!response.ok || !data.ok) {
        throw new Error(data.detalle || data.error || "No se pudo generar el acceso");
      }
      if (!data.codigo_acceso) {
        throw new Error("El servidor no devolvió el código de acceso.");
      }

      setCodigo(data.codigo_acceso);
      setCodigoCopiado(false);
      await validarCodigo(data.codigo_acceso);
    } catch (error) {
      mostrarError(error, "No se pudo generar el acceso");
    }
  }

  async function accederConCodigo(event?: FormEvent<HTMLFormElement>) {
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
      const response = await fetch("/api/validar-acceso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidato_id: candidato.candidato_id,
          codigo: codigoLimpio,
        }),
      });
      const data = await leerJson(response);

      if (!response.ok || !data.ok || !data.autenticado || !data.acceso_id) {
        throw new Error(
          data.mensaje || data.detalle || data.error || "El código no es válido"
        );
      }

      await crearSesion(data.acceso_id);
    } catch (error) {
      mostrarError(error, "No se pudo validar el código");
    }
  }

  async function crearSesion(accesoId: string) {
    setEstado("validando");
    setMensaje("Creando la sesión segura...");

    const response = await fetch("/api/sesion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ acceso_id: accesoId }),
    });
    const data = await leerJson(response);

    if (!response.ok || !data.ok) {
      throw new Error(data.detalle || data.error || "No se pudo crear la sesión");
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
        throw new Error(data.detalle || data.error || "No se pudo consultar la estimación");
      }

      if (!data.encontrada || !data.estimacion) {
        setEstimacion(null);
        setEstado("sin_estimacion");
        setMensaje(data.mensaje || "Todavía no existe una estimación disponible.");
        return;
      }

      setEstimacion(data.estimacion as Estimacion);
      setEstado("estimacion");
      setMensaje("");
    } catch (error) {
      mostrarError(error, "No se pudo consultar la estimación");
    }
  }

  async function copiarCodigo() {
    if (!codigo) return;
    try {
      await navigator.clipboard.writeText(codigo);
      setCodigoCopiado(true);
    } catch {
      setCodigoCopiado(false);
    }
  }

  function mostrarError(error: unknown, mensajePredeterminado: string) {
    console.error(error);
    setEstado("error");
    setMensaje(error instanceof Error ? error.message : mensajePredeterminado);
  }

  function reiniciar() {
    setBusqueda("");
    setCodigo("");
    setCodigoCopiado(false);
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
            <p style={styles.subtitle}>Consulta tu posición estimada en la OPE</p>
          </div>
        </header>

        <div style={styles.developmentNotice}>
          <strong>Versión de desarrollo.</strong>{" "}
          Actualmente el pago se simula para comprobar el funcionamiento de la plataforma.
        </div>

        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Busca tu candidatura</h2>
          <p style={styles.helpText}>Introduce tu nombre completo o tu DNI.</p>
          <form onSubmit={buscarCandidato}>
            <input
              type="text"
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
              placeholder="Rafael García o 12345678A"
              style={styles.input}
              disabled={cargando}
              autoComplete="off"
            />
            <button type="submit" style={styles.primaryButton} disabled={cargando}>
              {estado === "buscando" ? "Buscando..." : "Buscar candidatura"}
            </button>
          </form>
        </section>

        {candidatos.length > 0 && (
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>Candidatura encontrada</h2>
            <div style={styles.candidateList}>
              {candidatos.map((item) => {
                const seleccionado = candidato?.candidato_id === item.candidato_id;
                return (
                  <button
                    key={item.candidato_id}
                    type="button"
                    onClick={() => setCandidato(item)}
                    disabled={cargando}
                    style={{
                      ...styles.candidate,
                      ...(seleccionado ? styles.candidateSelected : {}),
                    }}
                  >
                    <strong>{item.nombre}</strong>
                    <span>{item.dni_mostrado}</span>
                    <span>{item.convocatoria}</span>
                    <small>Estado: {item.estado_convocatoria}</small>
                  </button>
                );
              })}
            </div>

            {candidato && (
              <>
                <div style={styles.separator} />
                <h3 style={styles.sectionTitle}>Acceso a la consulta</h3>
                <form onSubmit={accederConCodigo}>
                  <label style={styles.label}>Código de acceso</label>
                  <input
                    type="text"
                    value={codigo}
                    onChange={(event) => setCodigo(event.target.value.toUpperCase())}
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
                    {estado === "validando" ? "Validando..." : "Acceder con mi código"}
                  </button>
                </form>

                <button
                  type="button"
                  onClick={generarAccesoPrueba}
                  style={styles.secondaryButton}
                  disabled={cargando}
                >
                  {estado === "activando" ? "Generando..." : "Simular pago y generar código"}
                </button>
                <p style={styles.smallText}>
                  El botón de simulación es temporal y será sustituido por el pago real.
                </p>
              </>
            )}
          </section>
        )}

        {mensaje && (
          <div
            style={{
              ...styles.message,
              ...(estado === "error" ? styles.errorMessage : styles.successMessage),
            }}
          >
            {mensaje}
          </div>
        )}

        {codigo && estado !== "error" && (
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>Tu código de acceso</h2>
            <div style={styles.code}>{codigo}</div>
            <button type="button" onClick={copiarCodigo} style={styles.copyButton}>
              {codigoCopiado ? "Código copiado" : "Copiar código"}
            </button>
            <p style={styles.helpText}>
              Guárdalo. Será necesario para consultar futuras actualizaciones de esta OPE.
            </p>
          </section>
        )}

        {estado === "sin_estimacion" && (
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>Acceso correcto</h2>
            <p style={styles.emptyTitle}>Todavía no hay una estimación disponible</p>
            <p style={styles.helpText}>
              La candidatura, el código y la sesión se han validado correctamente.
            </p>
            <button type="button" onClick={consultarEstimacion} style={styles.secondaryButton}>
              Volver a consultar
            </button>
          </section>
        )}

        {estado === "estimacion" && estimacion && (
          <section style={styles.resultCard}>
            <div style={styles.resultHeader}>
              <div>
                <span style={styles.kicker}>RESULTADO PERSONAL</span>
                <h2 style={styles.resultTitle}>Tu estimación actual</h2>
                <p style={styles.helpText}>{estimacion.convocatoria}</p>
              </div>
              <span
                style={{
                  ...styles.confidenceBadge,
                  ...(estimacion.nivel_confianza === "media"
                    ? styles.confidenceMedium
                    : styles.confidenceLow),
                }}
              >
                Confianza {confianza.toLowerCase()}
              </span>
            </div>

            <div style={styles.primaryResult}>
              <span style={styles.primaryResultLabel}>Posición estimada</span>
              <strong style={styles.primaryResultValue}>
                {entero(estimacion.posicion_estimada)}
              </strong>
              <span style={styles.primaryResultRange}>
                Rango probable: {entero(estimacion.posicion_minima)}–{entero(estimacion.posicion_maxima)}
              </span>
            </div>

            <div style={styles.resultGrid}>
              <article style={styles.resultMetric}>
                <span style={styles.metricLabel}>Probabilidad estimada de plaza</span>
                <strong style={styles.metricValue}>{numero(estimacion.probabilidad_plaza, 1)}%</strong>
              </article>
              <article style={styles.resultMetric}>
                <span style={styles.metricLabel}>Plazas aplicables al cupo</span>
                <strong style={styles.metricValue}>
                  {entero(estimacion.datos_modelo?.plazas_aplicables ?? null)}
                </strong>
              </article>
            </div>

            <div style={styles.dataSection}>
              <div style={styles.sectionHeadingRow}>
                <div>
                  <span style={styles.officialBadge}>DATO OFICIAL</span>
                  <h3 style={styles.dataSectionTitle}>Fase de oposición</h3>
                </div>
                <strong style={styles.score}>{numero(estimacion.puntuacion_oposicion)} / 50</strong>
              </div>
              <p style={styles.sectionCopy}>
                Puntuación publicada en el listado oficial de personas aprobadas.
              </p>
            </div>

            <div style={styles.dataSection}>
              <div style={styles.sectionHeadingRow}>
                <div>
                  <span style={styles.estimatedBadge}>DATO ESTIMADO</span>
                  <h3 style={styles.dataSectionTitle}>Fase de concurso</h3>
                </div>
                <strong style={styles.score}>{numero(estimacion.meritos_estimados)} / 50</strong>
              </div>
              <p style={styles.sectionCopy}>
                {esCruceDirecto
                  ? "Estimación basada en una coincidencia nominal única con la bolsa de Enfermería."
                  : "Estimación estadística basada en candidatos con una nota de oposición similar."}
              </p>
            </div>

            <div style={styles.totalSection}>
              <span>Total estimado</span>
              <strong>{numero(estimacion.puntuacion_total_estimada)} / 100</strong>
            </div>

            <div style={styles.methodBox}>
              <strong>Cómo se ha calculado</strong>
              <p>{estimacion.comentario}</p>
              {estimacion.datos_modelo?.fecha_corte_bolsa && (
                <p>
                  Fecha de corte de la fuente de méritos: {estimacion.datos_modelo.fecha_corte_bolsa}.
                </p>
              )}
              {estimacion.datos_modelo?.nota && <p>{estimacion.datos_modelo.nota}</p>}
            </div>

            <div style={styles.warningBox}>
              <strong>No es una clasificación oficial.</strong>
              <p>
                La posición y la probabilidad pueden cambiar cuando se publiquen los méritos provisionales,
                alegaciones, correcciones o la relación definitiva del proceso.
              </p>
            </div>

            {fechaCalculo && (
              <p style={styles.updatedText}>Última actualización: {fechaCalculo}</p>
            )}
          </section>
        )}

        {(candidatos.length > 0 || estado === "error" || estado === "sin_estimacion" || estado === "estimacion") && (
          <button type="button" onClick={reiniciar} style={styles.resetButton} disabled={cargando}>
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
    padding: "36px 16px 70px",
    background: "#f3f6fa",
    color: "#172033",
    fontFamily: "Arial, Helvetica, sans-serif",
  },
  container: { width: "100%", maxWidth: "760px", margin: "0 auto" },
  header: { display: "flex", alignItems: "center", gap: "15px", marginBottom: "24px" },
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
  title: { margin: 0, fontSize: "32px" },
  subtitle: { margin: "5px 0 0", color: "#657084" },
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
  resultCard: {
    marginBottom: "18px",
    padding: "28px",
    border: "1px solid #cfd9e6",
    borderRadius: "22px",
    background: "#ffffff",
    boxShadow: "0 18px 50px rgba(20, 45, 75, 0.1)",
  },
  cardTitle: { margin: "0 0 16px", fontSize: "21px" },
  sectionTitle: { margin: "0 0 14px", fontSize: "18px" },
  label: { display: "block", marginBottom: "8px", fontWeight: 700 },
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
  copyButton: {
    width: "100%",
    marginTop: "10px",
    padding: "11px 16px",
    border: "1px solid #c7d1dd",
    borderRadius: "10px",
    background: "#f8fafc",
    color: "#173b67",
    fontWeight: 700,
    cursor: "pointer",
  },
  candidateList: { display: "grid", gap: "11px" },
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
  candidateSelected: { border: "2px solid #173b67", background: "#edf4fb" },
  separator: { height: "1px", margin: "22px 0", background: "#dfe5ec" },
  message: { marginBottom: "18px", padding: "14px 16px", borderRadius: "12px", lineHeight: 1.5 },
  successMessage: { border: "1px solid #a9d0b6", background: "#eaf6ee" },
  errorMessage: { border: "1px solid #e2aaaa", background: "#fdecec", color: "#8e2020" },
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
  helpText: { marginTop: "8px", color: "#657084", lineHeight: 1.6 },
  smallText: { marginBottom: 0, color: "#657084", fontSize: "13px", lineHeight: 1.5 },
  emptyTitle: { fontSize: "18px", fontWeight: 700 },
  resultHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "16px",
    flexWrap: "wrap",
  },
  kicker: { color: "#2563eb", fontSize: "12px", fontWeight: 800, letterSpacing: ".1em" },
  resultTitle: { margin: "8px 0 0", fontSize: "28px", letterSpacing: "-.03em" },
  confidenceBadge: {
    display: "inline-flex",
    padding: "8px 12px",
    borderRadius: "999px",
    fontSize: "13px",
    fontWeight: 800,
  },
  confidenceMedium: { background: "#e0f2fe", color: "#075985" },
  confidenceLow: { background: "#fff7ed", color: "#9a3412" },
  primaryResult: {
    marginTop: "24px",
    padding: "26px",
    borderRadius: "18px",
    background: "#0f172a",
    color: "#ffffff",
    textAlign: "center",
  },
  primaryResultLabel: { display: "block", color: "#cbd5e1", fontSize: "14px", fontWeight: 700 },
  primaryResultValue: { display: "block", margin: "8px 0", fontSize: "54px", lineHeight: 1 },
  primaryResultRange: { color: "#bfdbfe", fontSize: "15px" },
  resultGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "12px",
    marginTop: "14px",
  },
  resultMetric: { padding: "20px", borderRadius: "15px", background: "#f1f5f9", textAlign: "center" },
  metricLabel: { display: "block", marginBottom: "10px", color: "#64748b", fontSize: "14px" },
  metricValue: { display: "block", fontSize: "29px" },
  dataSection: {
    marginTop: "16px",
    padding: "20px",
    border: "1px solid #e2e8f0",
    borderRadius: "15px",
  },
  sectionHeadingRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
  },
  officialBadge: {
    display: "inline-flex",
    padding: "5px 8px",
    borderRadius: "999px",
    background: "#dcfce7",
    color: "#166534",
    fontSize: "11px",
    fontWeight: 800,
  },
  estimatedBadge: {
    display: "inline-flex",
    padding: "5px 8px",
    borderRadius: "999px",
    background: "#dbeafe",
    color: "#1d4ed8",
    fontSize: "11px",
    fontWeight: 800,
  },
  dataSectionTitle: { margin: "8px 0 0", fontSize: "18px" },
  score: { fontSize: "24px", whiteSpace: "nowrap" },
  sectionCopy: { margin: "12px 0 0", color: "#64748b", lineHeight: 1.55 },
  totalSection: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    marginTop: "16px",
    padding: "18px 20px",
    borderRadius: "15px",
    background: "#eff6ff",
    color: "#1e3a8a",
    fontWeight: 800,
    fontSize: "18px",
  },
  methodBox: {
    marginTop: "18px",
    padding: "18px",
    borderLeft: "4px solid #2563eb",
    background: "#f8fafc",
    lineHeight: 1.6,
  },
  warningBox: {
    marginTop: "14px",
    padding: "18px",
    border: "1px solid #f0cf8b",
    borderRadius: "14px",
    background: "#fffbeb",
    color: "#713f12",
    lineHeight: 1.6,
  },
  updatedText: { margin: "16px 0 0", color: "#64748b", fontSize: "13px" },
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
