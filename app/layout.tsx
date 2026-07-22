import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Baremia",
  description: "Estimaciones inteligentes para opositores",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
