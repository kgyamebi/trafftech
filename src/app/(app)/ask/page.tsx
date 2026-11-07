import Link from "next/link";
import { Conversation } from "@/components/conversation";
import { loadWorkspace } from "@/server/workspace";

export const metadata = { title: "Driver Intelligence" };

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const ws = await loadWorkspace();
  return (
    <div className="grid max-w-xl gap-8">
      <header>
        <p className="eyebrow">Ask Driver Intelligence</p>
        <h1 className="display mt-3 text-5xl">Talk from the records, not from the air.</h1>
        <p className="mt-3 text-muted">Spelling, a half phrase, a joke in the wording: it is read first, then checked against what you saved. It will not invent a record to keep the conversation going.</p>
      </header>
      <div className="flex flex-wrap gap-2">
        {["Why did my score fall?", "What needs renewal?", "Explain my trip.", "What's next?"].map((prompt) => (
          <Link key={prompt} href={`/ask?q=${encodeURIComponent(prompt)}`} className="rounded-[10px] border border-line px-3 py-2 text-sm">
            {prompt}
          </Link>
        ))}
      </div>
      <Conversation initial={q} turns={ws.questions.map((item) => ({ id: item.id, question: item.question, answer: item.answer }))} />
    </div>
  );
}
