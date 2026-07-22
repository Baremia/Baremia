import { Geist } from "next/font/google";

const geist = Geist({
  subsets: ["latin"],
});
export const metadata = {
  title: "Baremia",
  description:
    "Analizamos miles de datos oficiales para estimar tu posición y ayudarte a tomar mejores decisiones.",
  icons: {
    icon: [
      {
        url: "/favicon.ico",
      },
      {
        url: "/favicon-32.png",
        sizes: "32x32",
        type: "image/png",
      },
      {
        url: "/favicon-16.png",
        sizes: "16x16",
        type: "image/png",
      },
    ],
    apple: "/apple-touch-icon.png",
  },
};
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={geist.className}>{children}</body>
    </html>
  );
}
