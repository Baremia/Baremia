import type { Metadata } from "next";
import PublicFooter from "../components/PublicFooter";
import "./globals.css";

export const metadata: Metadata = {
  title: "Baremia",
  description: "Consulta tu estimación de posición en procesos OPE",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>
        {children}
        <PublicFooter />
      </body>
    </html>
  );
}
