"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Status = "procesando" | "confirmado" | "error";
type MailStatus = "pendiente" | "enviado" | "incidencia";

export default function PaymentCompletion({ sessionId }: { sessionId: string }) {
  const [status, setStatus] = useState<Status>("procesando");
  const [mail, setMail] = useState<MailStatus>("pendiente");

  useEffect(() => {
    if (!sessionId) {
      setStatus("error");
      return;
    }

    let cancelled = false;
    let timer: number | undefined;
    let attempts = 0;

    async function check() {
      attempts += 1;
      try {
        const response = await fetch(
          `/api/pagos/stripe/estado?session_id=${encodeURIComponent(sessionId)}`,
          { cache: "no-store" }
        );
        const data = await response.json();
        if (cancelled) return;

        if (!response.ok || !data.ok) {
          setStatus("error");
          return;
        }

        const nextStatus: Status =
          data.estado === "confirmado" ? "confirmado" : "procesando";
        const nextMail: MailStatus = ["enviado", "incidencia"].includes(data.correo)
          ? data.correo
          : "pendiente";

        setStatus(nextStatus);
        setMail(nextMail);

        if (nextMail !== "enviado" && nextMail !== "incidencia" && attempts < 15) {
          timer = window.setTimeout(check, 2000);
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    void check();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [sessionId]);

  const delivered = status === "confirmado" && mail === "enviado";
  const incident = mail === "incidencia" || status === "error";

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 20,
        background: "#f3f6fa",
        color: "#172033",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 620,
          padding: 32,
          border: "1px solid #dce3ec",
          borderRadius: 22,
          background: "#fff",
          boxShadow: "0 18px 50px rgba(20,45,75,.09)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "grid",
            placeItems: "center",
            width: 54,
            height: 54,
            margin: "0 auto 18px",
            borderRadius: 15,
            background: delivered ? "#166534" : incident ? "#9a3412" : "#173b67",
            color: "#fff",
            fontSize: 26,
            fontWeight: 800,
          }}
        >
          {delivered ? "✓" : incident ? "!" : "B"}
        </div>

        <h1 style={{ margin: "0 0 12px", fontSize: 30 }}>
          {delivered
            ? "Tu acceso está listo"
            : incident
              ? "Estamos revisando la entrega"
              : "Estamos confirmando tu acceso"}
        </h1>

        <p style={{ color: "#657084", lineHeight: 1.7, fontSize: 16 }}>
          {delivered
            ? "El pago se ha confirmado y hemos enviado tu código BRM por correo electrónico."
            : incident
              ? "El pago puede estar confirmado, pero el correo todavía no se ha podido entregar. Tu compra queda registrada y no necesitas volver a pagar."
              : "Stripe está confirmando el pago y Baremia está preparando el correo con tu código BRM. Normalmente tarda solo unos segundos."}
        </p>

        {delivered && (
          <p
            style={{
              margin: "22px 0",
              padding: 16,
              borderRadius: 12,
              background: "#ecfdf3",
              color: "#166534",
              lineHeight: 1.6,
            }}
          >
            Revisa también la carpeta de spam o correo no deseado si no lo encuentras en tu bandeja de entrada.
          </p>
        )}

        <Link
          href="/"
          style={{
            display: "inline-block",
            marginTop: 8,
            padding: "13px 20px",
            borderRadius: 11,
            background: "#173b67",
            color: "#fff",
            textDecoration: "none",
            fontWeight: 700,
          }}
        >
          Volver a Baremia
        </Link>

        <p style={{ margin: "24px 0 0", color: "#7b8798", fontSize: 13, lineHeight: 1.5 }}>
          No cierres esta página hasta que confirmemos el envío si acabas de realizar el pago.
        </p>
      </section>
    </main>
  );
}
