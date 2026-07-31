import { redirect } from "next/navigation";
import AdminSidebar from "../../../components/admin/AdminSidebar";
import { hasAdminSession } from "../../../lib/admin-auth";

export default async function AdminPanelLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  if (!(await hasAdminSession())) {
    redirect("/admin/login");
  }

  return (
    <div className="admin-shell">
      <AdminSidebar />
      <main className="admin-main">{children}</main>
    </div>
  );
}
