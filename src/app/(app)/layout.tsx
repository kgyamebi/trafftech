import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell";
import { loadWorkspace } from "@/server/workspace";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const workspace = await loadWorkspace();
  if (workspace.mode === "user" && !workspace.viewer.onboardingCompleted) redirect("/onboarding");
  return <AppShell workspace={workspace}>{children}</AppShell>;
}
