import { DocumentForm } from "@/components/forms";
import { documentTight } from "@/server/field-store";
import { loadWorkspace } from "@/server/workspace";

export const metadata = { title: "Add a document" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; label?: string; expiresOn?: string; note?: string; reading?: string }>;
}) {
  const ws = await loadWorkspace();
  const initial = await searchParams;
  return (
    <div className="mx-auto grid max-w-xl gap-6">
      <h1 className="display text-5xl">Add a document</h1>
      {ws.mode === "demo" ? <p>Demo documents stay as they are. Create an account to store yours.</p> : <DocumentForm ws={ws} initial={initial} tight={documentTight(ws.mode)} />}
    </div>
  );
}
