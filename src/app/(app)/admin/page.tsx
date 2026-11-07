import { notFound } from "next/navigation";
import { AdminScreen } from "@/components/rest-screens";
import { getSession } from "@/server/session";
import { readDatabase } from "@/server/store";
import { loadWorkspace } from "@/server/workspace";

export const metadata = { title: "Admin" };

export default async function Page() {
  const session = await getSession();
  const ws = await loadWorkspace();
  if (session?.mode !== "user" || ws.viewer.role !== "admin") notFound();
  const db = readDatabase();
  return (
    <AdminScreen
      users={db.users.map((u) => ({
        email: u.email,
        plan: u.planStatus === "active" ? u.plan : `${u.plan} pending`,
        role: u.role,
        vehicles: db.vehicles.filter((v) => v.userId === u.id).length,
      }))}
      audits={db.audit.map((a) => ({ action: a.action, at: a.at }))}
    />
  );
}
