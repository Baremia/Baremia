"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function PublicFooter() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;

  return (
    <footer
      style={{
        padding: "26px 18px 34px",
        borderTop: "1px solid #dfe6ef",
        background: "#eef3f8",
        color: "#657084",
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: 13,
        lineHeight: 1.6,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 860,
          margin: "0 auto",
          display: "flex",
          justifyContent: "space-between",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <span>
          Baremia es un servicio independiente. No representa a la Comunidad de Madrid ni al Servicio Madrileño de Salud.
        </span>
        <nav style={{ display: "flex", gap: 16 }} aria-label="Información de Baremia">
          <Link href="/metodologia" style={{ color: "#17467f", fontWeight: 700 }}>
            Metodología
          </Link>
        </nav>
      </div>
    </footer>
  );
}
