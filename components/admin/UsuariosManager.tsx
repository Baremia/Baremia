"use client";

import { FormEvent, useState, type CSSProperties } from "react";

type UsuarioAcceso = {
  candidato_id: string;
  nombre: string;
  dni_mostrado: string;
  convocatoria_id: string;
  convocatoria: string;
  acceso_id: string | null;
  acceso_estado: string | null;
  acceso_creado_at: string | null;
  ultimo_acceso_at: string | null;
  intentos_fallidos: number;
  bloqueado_hasta: string | null;
  pago_estado: string | null;
  pago_importe: number | string | null;
  pago_moneda: string | null;
  fecha_pago: string | null;
  sesiones_activas: number;
  tiene_estimacion: boolean;
};

type Payload = {
  ok?: boolean;
  usuarios?: UsuarioAcceso[];
  codigo_acceso?: string;
  mensaje?: string;
  error?: string;
  detalle?: string;
};

async function readPayload(response: Response): Promise<Payload> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Payload;
  } catch {
    return {
      ok: false,
      error: `El servidor respondió con HTTP ${response.status}.`,
      detalle: text.slice(0, 300),
    };
  }
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatMoney(value: number | string | null, currency: string | null) {
  if (value === null) return "—";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: currency || "EUR",
  }).format(amount);
}

export default function UsuariosManager() {
  const [search, setSearch] = useState("");
  const [usuarios, setUsuarios] = useState<UsuarioAcceso[]>([]);
  const [loading, setLoading] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newCodeName, setNewCodeName] = useState("");
  const [copied, setCopied] = useState(false);

  async function buscar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = search.trim();

    if (query.length < 2) {
      setError("Introduce al menos dos caracteres.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");
    setNewCode("");
    setNewCodeName("");
    setCopied(false);

    try {
      const response = await fetch(
        `/api/admin/usuarios?q=${encodeURIComponent(query)}`,
        { cache: "no-store" }
      );
      const payload = await readPayload(response);

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.detalle || payload.error || "No se pudieron buscar usuarios."
        );
      }

      setUsuarios(payload.usuarios ?? []);
      if ((payload.usuarios ?? []).length === 0) {
        setMessage("No se encontraron candidatos con esos datos.");
      }
    } catch (searchError) {
      setError(
        searchError instanceof Error
          ? searchError.message
          : "No se pudieron buscar usuarios."
      );
    } finally {
      setLoading(false);
    }
  }

  async function regenerar(usuario: UsuarioAcceso) {
    if (!usuario.acceso_id) return;

    const confirmed = window.confirm(
      `¿Regenerar el código de ${usuario.nombre}? El código anterior dejará de funcionar y se cerrarán sus sesiones abiertas.`
    );
    if (!confirmed) return;

    setRegeneratingId(usuario.candidato_id);
    setError("");
    setMessage("");
    setNewCode("");
    setNewCodeName("");
    setCopied(false);

    try {
      const response = await fetch("/api/admin/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "regenerar_codigo",
          candidato_id: usuario.candidato_id,
        }),
      });
      const payload = await readPayload(response);

      if (!response.ok || !payload.ok || !payload.codigo_acceso) {
        throw new Error(
          payload.detalle || payload.error || "No se pudo regenerar el código."
        );
      }

      setNewCode(payload.codigo_acceso);
      setNewCodeName(usuario.nombre);
      setMessage(payload.mensaje || "Código regenerado correctamente.");
      setUsuarios((current) =>
        current.map((item) =>
          item.candidato_id === usuario.candidato_id
            ? {
                ...item,
                acceso_estado: "activo",
                intentos_fallidos: 0,
                bloqueado_hasta: null,
                sesiones_activas: 0,
              }
            : item
        )
      );
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : "No se pudo regenerar el código."
      );
    } finally {
      setRegeneratingId(null);
    }
  }

  async function copyCode() {
    if (!newCode) return;
    try {
      await navigator.clipboard.writeText(newCode);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="admin-eyebrow">ACTIVIDAD</p>
          <h1>Usuarios y accesos</h1>
          <p>Busca candidatos, revisa pagos y recupera códigos perdidos.</p>
        </div>
      </header>

      <section className="admin-panel-card admin-form-card" style={{ maxWidth: 900 }}>
        <div className="admin-panel-heading">
          <p className="admin-eyebrow">BÚSQUEDA</p>
          <h2>Localizar candidato</h2>
        </div>

        <form className="admin-data-form" onSubmit={buscar}>
          <label>
            Nombre, DNI publicado o número de registro
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="PADILLA LAMADRID o ****6292"
              disabled={loading}
            />
          </label>

          <button
            className="admin-primary-button"
            type="submit"
            disabled={loading || search.trim().length < 2}
          >
            {loading ? "Buscando…" : "Buscar"}
          </button>
        </form>
      </section>

      {error && <div className="admin-alert admin-alert-error">{error}</div>}
      {message && <div className="admin-alert admin-alert-success">{message}</div>}

      {newCode && (
        <section className="admin-panel-card" style={styles.codeCard}>
          <p className="admin-eyebrow">CÓDIGO NUEVO</p>
          <h2 style={{ margin: "8px 0" }}>{newCodeName}</h2>
          <div style={styles.code}>{newCode}</div>
          <button
            type="button"
            className="admin-secondary-button"
            onClick={copyCode}
            style={{ marginTop: 12 }}
          >
            {copied ? "Código copiado" : "Copiar código"}
          </button>
          <p style={styles.warningText}>
            Este código solo se muestra ahora. El anterior ya no funciona y las sesiones previas se han cerrado.
          </p>
        </section>
      )}

      {usuarios.length > 0 && (
        <section className="admin-panel-card" style={{ marginTop: 24 }}>
          <div className="admin-panel-heading">
            <p className="admin-eyebrow">RESULTADOS</p>
            <h2>{usuarios.length} candidato{usuarios.length === 1 ? "" : "s"}</h2>
          </div>

          <div style={styles.resultsGrid}>
            {usuarios.map((usuario) => (
              <article key={usuario.candidato_id} style={styles.userCard}>
                <div style={styles.userHeader}>
                  <div>
                    <h3 style={styles.userName}>{usuario.nombre}</h3>
                    <p style={styles.muted}>{usuario.dni_mostrado}</p>
                    <p style={styles.muted}>{usuario.convocatoria}</p>
                  </div>
                  <span
                    style={{
                      ...styles.statusBadge,
                      ...(usuario.acceso_estado === "activo"
                        ? styles.statusActive
                        : styles.statusInactive),
                    }}
                  >
                    {usuario.acceso_estado ?? "Sin acceso"}
                  </span>
                </div>

                <div style={styles.infoGrid}>
                  <div>
                    <span style={styles.infoLabel}>Pago</span>
                    <strong>{usuario.pago_estado ?? "Sin pago"}</strong>
                    <small style={styles.infoSmall}>
                      {formatMoney(usuario.pago_importe, usuario.pago_moneda)}
                    </small>
                  </div>
                  <div>
                    <span style={styles.infoLabel}>Estimación</span>
                    <strong>{usuario.tiene_estimacion ? "Disponible" : "Pendiente"}</strong>
                  </div>
                  <div>
                    <span style={styles.infoLabel}>Sesiones activas</span>
                    <strong>{usuario.sesiones_activas}</strong>
                  </div>
                  <div>
                    <span style={styles.infoLabel}>Intentos fallidos</span>
                    <strong>{usuario.intentos_fallidos}</strong>
                  </div>
                </div>

                <div style={styles.dateGrid}>
                  <p>
                    <span>Acceso creado</span>
                    <strong>{formatDate(usuario.acceso_creado_at)}</strong>
                  </p>
                  <p>
                    <span>Último acceso</span>
                    <strong>{formatDate(usuario.ultimo_acceso_at)}</strong>
                  </p>
                  <p>
                    <span>Fecha de pago</span>
                    <strong>{formatDate(usuario.fecha_pago)}</strong>
                  </p>
                </div>

                <button
                  type="button"
                  className="admin-primary-button"
                  onClick={() => regenerar(usuario)}
                  disabled={!usuario.acceso_id || regeneratingId === usuario.candidato_id}
                >
                  {!usuario.acceso_id
                    ? "Sin acceso que recuperar"
                    : regeneratingId === usuario.candidato_id
                      ? "Regenerando…"
                      : "Regenerar código"}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  codeCard: {
    marginTop: 24,
    maxWidth: 720,
    padding: 24,
  },
  code: {
    padding: "18px 20px",
    borderRadius: 12,
    background: "#0f172a",
    color: "#ffffff",
    fontFamily: "monospace",
    fontSize: 20,
    fontWeight: 800,
    letterSpacing: ".04em",
    textAlign: "center",
    wordBreak: "break-word",
  },
  warningText: {
    marginBottom: 0,
    color: "#64748b",
    fontSize: 13,
    lineHeight: 1.5,
  },
  resultsGrid: {
    display: "grid",
    gap: 16,
    marginTop: 20,
  },
  userCard: {
    padding: 20,
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    background: "#ffffff",
  },
  userHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },
  userName: {
    margin: 0,
    fontSize: 18,
  },
  muted: {
    margin: "5px 0 0",
    color: "#64748b",
    fontSize: 13,
  },
  statusBadge: {
    display: "inline-flex",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    textTransform: "capitalize",
    whiteSpace: "nowrap",
  },
  statusActive: {
    background: "#dcfce7",
    color: "#166534",
  },
  statusInactive: {
    background: "#f1f5f9",
    color: "#475569",
  },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 10,
    marginTop: 18,
  },
  infoLabel: {
    display: "block",
    marginBottom: 4,
    color: "#64748b",
    fontSize: 12,
  },
  infoSmall: {
    display: "block",
    marginTop: 3,
    color: "#64748b",
  },
  dateGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
    margin: "18px 0",
    padding: 14,
    borderRadius: 12,
    background: "#f8fafc",
  },
};
