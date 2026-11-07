import { ProtectionScreen } from "@/components/protection-screen";
import { loadWorkspace } from "@/server/workspace";

export const metadata = { title: "Protection" };

export default async function Page() {
  return <ProtectionScreen ws={await loadWorkspace()} />;
}
