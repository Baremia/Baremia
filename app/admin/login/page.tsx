"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "No se pudo iniciar sesión");
      }

      router.replace("/admin");
      router.refresh();
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "No se pudo iniciar sesión"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="admin-login-page">
      <section className="admin-login-card">
        <Image
          src="/logo.svg"
          alt="Baremia"
          width={240}
          height={58}
          className="admin-login-logo"
          priority
        />

        <div className="admin-login-heading">
          <p>ÁREA PRIVADA</p>
          <h1>Panel de administración</h1>
          <span>Acceso exclusivo para la gestión interna de Baremia.</span>
        </div>

        <form onSubmit={login} className="admin-login-form">
          <label htmlFor="admin-password">Contraseña</label>
          <input
            id="admin-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            disabled={loading}
          />

          {error && <p className="admin-form-error">{error}</p>}

          <button type="submit" className="button button-primary" disabled={loading}>
            {loading ? "Accediendo..." : "Entrar al panel"}
          </button>
        </form>
      </section>
    </main>
  );
}
