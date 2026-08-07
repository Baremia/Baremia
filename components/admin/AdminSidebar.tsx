import Image from "next/image";
import Link from "next/link";
import AdminLogoutButton from "./AdminLogoutButton";

const navigation = [
  { href: "/admin", label: "Dashboard", icon: "▦" },
  { href: "/admin/convocatorias", label: "Convocatorias", icon: "◎" },
  { href: "/admin/listados", label: "Listados", icon: "▤" },
  { href: "/admin/estimaciones", label: "Estimaciones", icon: "↗" },
  { href: "/admin/calibracion", label: "Calibración", icon: "≈" },
  { href: "/admin/usuarios", label: "Usuarios", icon: "◉" },
  { href: "/admin/configuracion", label: "Configuración", icon: "⚙" },
];

export default function AdminSidebar() {
  return (
    <aside className="admin-sidebar">
      <div>
        <Link href="/admin" className="admin-brand" aria-label="Baremia Admin">
          <Image
            src="/logo-white.svg"
            alt="Baremia"
            width={190}
            height={48}
            className="admin-brand-logo"
            priority
          />
          <span>Administración</span>
        </Link>

        <nav className="admin-navigation" aria-label="Navegación de administración">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href}>
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      <AdminLogoutButton />
    </aside>
  );
}
