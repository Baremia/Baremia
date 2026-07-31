"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Convocatoria = {
  id: string;
  nombre: string;
  organismo: string;
  categoria: string;
  comunidad_autonoma: string;
  estado: string;
  fecha_convocatoria: string | null;
  fecha_actualizacion: string | null;
};

type FormState = Omit<Convocatoria, "id" | "fecha_actualizacion">;

const EMPTY_FORM: FormState = {
  nombre: "",
  organismo: "",
  categoria: "",
  comunidad_autonoma: "",
  estado: "activa",
  fecha_convocatoria: "",
};

function formatDate(value: string | null) {
  if (!value) return "Sin fecha";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(date);
}

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

export default function ConvocatoriasManager() {
  const [items, setItems] = useState<Convocatoria[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [search, setSearch] = useState("");

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/convocatorias", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(payload, "No se pudieron cargar."));
      setItems(payload.convocatorias ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    if (!query) return items;
    return items.filter((item) =>
      [item.nombre, item.organismo, item.categoria, item.comunidad_autonoma, item.estado]
        .join(" ")
        .toLocaleLowerCase("es")
        .includes(query)
    );
  }, [items, search]);

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setError("");
  }

  function startEditing(item: Convocatoria) {
    setEditingId(item.id);
    setForm({
      nombre: item.nombre ?? "",
      organismo: item.organismo ?? "",
      categoria: item.categoria ?? "",
      comunidad_autonoma: item.comunidad_autonoma ?? "",
      estado: item.estado ?? "",
      fecha_convocatoria: item.fecha_convocatoria?.slice(0, 10) ?? "",
    });
    setMessage("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/admin/convocatorias", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, ...form } : form),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(payload, "No se pudo guardar."));

      setMessage(editingId ? "Convocatoria actualizada." : "Convocatoria creada.");
      resetForm();
      await loadItems();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: Convocatoria) {
    const confirmed = window.confirm(
      `¿Eliminar “${item.nombre}”? Esta acción solo funcionará si no tiene datos vinculados.`
    );
    if (!confirmed) return;

    setDeletingId(item.id);
    setMessage("");
    setError("");
    try {
      const response = await fetch(
        `/api/admin/convocatorias?id=${encodeURIComponent(item.id)}`,
        { method: "DELETE" }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(payload, "No se pudo eliminar."));
      setMessage("Convocatoria eliminada.");
      if (editingId === item.id) resetForm();
      await loadItems();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="admin-eyebrow">GESTIÓN</p>
          <h1>Convocatorias</h1>
          <p>Crea y actualiza los procesos selectivos disponibles en Baremia.</p>
        </div>
        <span className="admin-live-badge">{items.length} registradas</span>
      </header>

      <section className="admin-crud-grid">
        <article className="admin-panel-card admin-form-card">
          <div className="admin-panel-heading">
            <p className="admin-eyebrow">{editingId ? "EDICIÓN" : "NUEVA"}</p>
            <h2>{editingId ? "Editar convocatoria" : "Crear convocatoria"}</h2>
          </div>

          <form className="admin-data-form" onSubmit={submit}>
            <label>
              Nombre <span>*</span>
              <input value={form.nombre} onChange={(e) => updateField("nombre", e.target.value)} required />
            </label>
            <label>
              Organismo <span>*</span>
              <input value={form.organismo} onChange={(e) => updateField("organismo", e.target.value)} required />
            </label>
            <div className="admin-form-row">
              <label>
                Categoría <span>*</span>
                <input value={form.categoria} onChange={(e) => updateField("categoria", e.target.value)} required />
              </label>
              <label>
                Comunidad autónoma <span>*</span>
                <input value={form.comunidad_autonoma} onChange={(e) => updateField("comunidad_autonoma", e.target.value)} required />
              </label>
            </div>
            <div className="admin-form-row">
              <label>
                Estado <span>*</span>
                <input value={form.estado} onChange={(e) => updateField("estado", e.target.value)} required />
                <small>Usa exactamente uno de los estados permitidos en tu base de datos.</small>
              </label>
              <label>
                Fecha de convocatoria
                <input type="date" value={form.fecha_convocatoria ?? ""} onChange={(e) => updateField("fecha_convocatoria", e.target.value)} />
              </label>
            </div>

            {error && <p className="admin-alert admin-alert-error">{error}</p>}
            {message && <p className="admin-alert admin-alert-success">{message}</p>}

            <div className="admin-form-actions">
              <button className="button button-primary" type="submit" disabled={saving}>
                {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Crear convocatoria"}
              </button>
              {editingId && (
                <button className="button button-secondary" type="button" onClick={resetForm} disabled={saving}>
                  Cancelar edición
                </button>
              )}
            </div>
          </form>
        </article>

        <article className="admin-panel-card admin-list-card">
          <div className="admin-list-toolbar">
            <div>
              <p className="admin-eyebrow">REGISTRO</p>
              <h2>Convocatorias existentes</h2>
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
            <div className="admin-loading-state">Cargando convocatorias…</div>
          ) : filteredItems.length === 0 ? (
            <div className="admin-loading-state">No hay convocatorias que mostrar.</div>
          ) : (
            <div className="admin-record-list">
              {filteredItems.map((item) => (
                <article key={item.id} className="admin-record-card">
                  <div className="admin-record-main">
                    <div className="admin-record-title-row">
                      <h3>{item.nombre}</h3>
                      <span className="admin-state-pill">{item.estado}</span>
                    </div>
                    <p>{item.organismo}</p>
                    <dl>
                      <div><dt>Categoría</dt><dd>{item.categoria}</dd></div>
                      <div><dt>Ámbito</dt><dd>{item.comunidad_autonoma}</dd></div>
                      <div><dt>Fecha</dt><dd>{formatDate(item.fecha_convocatoria)}</dd></div>
                    </dl>
                  </div>
                  <div className="admin-record-actions">
                    <button type="button" onClick={() => startEditing(item)}>Editar</button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => void remove(item)}
                      disabled={deletingId === item.id}
                    >
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
