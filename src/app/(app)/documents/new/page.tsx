import { DocumentForm } from "@/components/forms";
import { loadWorkspace } from "@/server/workspace";

export const metadata = { title: "Add a document" };

export default async function Page() {
  const ws = await loadWorkspace();
  return (
    <div className="mx-auto grid max-w-xl gap-6">
      <h1 className="display text-5xl">Add a document</h1>
      {ws.mode === "demo" ? <p>Demo documents stay as they are. Create an account to store yours.</p> : <DocumentForm ws={ws} />}
    </div>
  );
}
