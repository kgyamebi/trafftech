import { DocumentsScreen } from "@/components/rest-screens";
import { documentTight } from "@/server/field-store";
import { loadWorkspace } from "@/server/workspace";

export const metadata = { title: "Documents" };

export default async function Page() {
  const ws = await loadWorkspace();
  return <DocumentsScreen ws={ws} tight={documentTight(ws.mode)} />;
}
