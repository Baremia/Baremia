"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Convocatoria = {
  id: string;
  nombre: string;
  estado: string;
};

type Listado = {
  id: string;
  convocatoria_id: string;
  tipo: string;
  nombre_archivo: string;
  ruta_storage: string;
  fecha_publicacion: string | null;
  estado: string;
  fecha_creacion: string | null;
};

function getErrorMessage(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }
  return fallback;
}

function formatDate(value: string | null) {
  if (!value) return "Sin fecha";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(date);
}

export default function ListadosManager() {
  const [listados, setListados] = useState<Listado[]>([]);
  const [convocatorias, setConvocatorias] = useState<Convocatoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/listados", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(payload, "No se pudieron cargar los listados."));
      setListados(payload.listados ?? []);
      setConvocatorias(payload.convocatorias ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los listados.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const convocatoriaNames = useMemo(
    () => new Map(convocatorias.map((item) => [item.id, item.nombre])),
    [convocatorias]
  );

  const filteredListados = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    if (!query) return listados;
    return listados.filter((item) =>
      [
        item.nombre_archivo,
        item.tipo,
        item.estado,
        convocatoriaNames.get(item.convocatoria_id) ?? "",
      ]
        .join(" ")
        .toLocaleLowerCase("es")
        .includes(query)
    );
  }, [convocatoriaNames, listados, search]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const response = await fetch("/api/admin/listados", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(payload, "No se pudo guardar el listado."));

      form.reset();
      setMessage("Listado subido y registrado correctamente.");
      await loadData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el listado.");
    } finally {
      setSaving(false);
    }
  }

  async function download(item: Listado) {
    setDownloadingId(item.id);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/listados?action=download&id=${encodeURIComponent(item.id)}`,
        { cache: "no-store" }
      );
      const payload = await response.json();
      if (!response.ok || !payload.url) {
        throw new Error(getErrorMessage(payload, "No se pudo descargar el PDF."));
      }
      window.open(payload.url, "_blank", "noopener,noreferrer");
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "No se pudo descargar el PDF.");
    } finally {
      setDownloadingId(null);
    }
  }

  async function processListado(item: Listado) {
    if (!window.confirm(`¿Procesar “${item.nombre_archivo}”?`)) return;

    setProcessingId(item.id);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/procesar-listado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listado_id: item.id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(payload, "No se pudo procesar el listado."));

      const paginas = payload.resultado?.paginas ?? 0;
      const lineas = payload.resultado?.lineas ?? 0;
      setMessage(`PDF procesado: ${paginas} páginas y ${lineas} líneas extraídas.`);
      await loadData();
    } catch (processingError) {
      setError(
        processingError instanceof Error
          ? processingError.message
          : "No se pudo procesar el listado."
      );
      await loadData();
    } finally {
      setProcessingId(null);
    }
  }

  async function remove(item: Listado) {
    if (!window.confirm(`¿Eliminar “${item.nombre_archivo}”?`)) return;

    setDeletingId(item.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/listados?id=${encodeURIComponent(item.id)}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(payload, "No se pudo eliminar el listado."));
      setMessage("Listado eliminado.");
      await loadData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar el listado.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="admin-eyebrow">DOCUMENTOS</p>
          <h1>Listados oficiales</h1>
          <p>Sube los PDF oficiales y controla su estado de procesamiento.</p>
        </div>
        <span className="admin-live-badge">{listados.length} registrados</span>
      </header>

      <section className="admin-crud-grid">
        <article className="admin-panel-card admin-form-card">
          <div className="admin-panel-heading">
            <p className="admin-eyebrow">NUEVO</p>
            <h2>Subir listado</h2>
          </div>

          <form className="admin-data-form" onSubmit={submit}>
            <label>
              Convocatoria <span>*</span>
              <select name="convocatoria_id" required defaultValue="">
                <option value="" disabled>Selecciona una convocatoria</option>
                {convocatorias.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre}{item.estado ? ` · ${item.estado}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Tipo de listado <span>*</span>
              <select name="tipo" required defaultValue="">
                <option value="" disabled>Selecciona el tipo</option>
                <option value="provisional">Provisional</option>
                <option value="definitivo">Definitivo</option>
                <option value="meritos">Méritos</option>
                <option value="admitidos">Admitidos</option>
                <option value="excluidos">Excluidos</option>
                <option value="otro">Otro</option>
              </select>
            </label>

            <div className="admin-form-row">
              <label>
                Fecha oficial
                <input type="date" name="fecha_publicacion" />
              </label>
              <label>
                Estado <span>*</span>
                <select name="estado" defaultValue="pendiente" required>
                  <option value="pendiente">Pendiente</option>
                  <option value="procesando">Procesando</option>
                  <option value="procesado">Procesado</option>
                  <option value="publicado">Publicado</option>
                  <option value="error">Error</option>
                </select>
              </label>
            </div>

            <label>
              Archivo PDF <span>*</span>
              <input type="file" name="archivo" accept="application/pdf,.pdf" required />
              <small>Formato PDF. Tamaño máximo: 20 MB.</small>
            </label>

            {error && <p className="admin-alert admin-alert-error">{error}</p>}
            {message && <p className="admin-alert admin-alert-success">{message}</p>}

            <div className="admin-form-actions">
              <button className="button button-primary" type="submit" disabled={saving || convocatorias.length === 0}>
                {saving ? "Subiendo…" : "Subir listado"}
              </button>
            </div>
          </form>
        </article>

        <article className="admin-panel-card admin-list-card">
          <div className="admin-list-toolbar">
            <div>
              <p className="admin-eyebrow">REGISTRO</p>
              <h2>Listados existentes</h2>
            </div>
            <input
              className="admin-search-input"
              type="search"
              placeholder="Buscar…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          {loading ? (
            <div className="admin-loading-state">Cargando listados…</div>
          ) : filteredListados.length === 0 ? (
            <div className="admin-loading-state">No hay listados que mostrar.</div>
          ) : (
            <div className="admin-record-list">
              {filteredListados.map((item) => (
                <article key={item.id} className="admin-record-card">
                  <div className="admin-record-main">
                    <div className="admin-record-title-row">
                      <h3>{item.nombre_archivo}</h3>
                      <span className="admin-state-pill">{item.estado}</span>
                    </div>
                    <p>{convocatoriaNames.get(item.convocatoria_id) ?? "Convocatoria no disponible"}</p>
                    <dl>
                      <div><dt>Tipo</dt><dd>{item.tipo}</dd></div>
                      <div><dt>Fecha oficial</dt><dd>{formatDate(item.fecha_publicacion)}</dd></div>
                      <div><dt>Subido</dt><dd>{formatDate(item.fecha_creacion)}</dd></div>
                    </dl>
                  </div>
                  <div className="admin-record-actions">
                    <button
                      className="button button-primary"
                      type="button"
                      onClick={() => void processListado(item)}
                      disabled={processingId === item.id || item.estado === "procesando"}
                    >
                      {processingId === item.id || item.estado === "procesando"
                        ? "Procesando…"
                        : item.estado === "procesado"
                          ? "Reprocesar PDF"
                          : "Procesar PDF"}
                    </button>
                    <button type="button" onClick={() => void download(item)} disabled={downloadingId === item.id}>
                      {downloadingId === item.id ? "Abriendo…" : "Descargar"}
                    </button>
                    <button className="danger" type="button" onClick={() => void remove(item)} disabled={deletingId === item.id}>
                      {deletingId === item.id ? "Eliminando…" : "Eliminar"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
