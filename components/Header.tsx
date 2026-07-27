import Image from "next/image";
import Link from "next/link";

export default function Header() {
  return (
    <header className="site-header">
      <Link href="/" className="brand" aria-label="Baremia, inicio">
        <Image
          src="/logo.svg"
          alt="Baremia"
          width={320}
          height={78}
          priority
          className="brand-logo"
        />
      </Link>

      <nav className="main-nav" aria-label="Navegación principal">
        <Link href="/#como-funciona">Cómo funciona</Link>

        <Link href="/convocatorias">Convocatorias</Link>

        <Link href="/iniciar-sesion" className="button button-secondary">
          Iniciar sesión
        </Link>
      </nav>
    </header>
  );
}
