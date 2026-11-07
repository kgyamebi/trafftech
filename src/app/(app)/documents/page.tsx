import { DocumentsScreen } from "@/components/rest-screens";
import { loadWorkspace } from "@/server/workspace";

export const metadata = { title: "Documents" };

export default async function Page() {
  return <DocumentsScreen ws={await loadWorkspace()} />;
}
