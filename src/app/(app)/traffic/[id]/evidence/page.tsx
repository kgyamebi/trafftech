import { EvidenceView } from "@/components/evidence-view";
import { loadWorkspace } from "@/server/workspace";

export const metadata = { title: "Evidence" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await loadWorkspace();
  return <EvidenceView violation={ws.violations.find((v) => v.id === id)} />;
}
