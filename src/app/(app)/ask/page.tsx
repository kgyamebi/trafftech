import Link from "next/link";
import { AskForm } from "@/components/forms";
import { loadWorkspace } from "@/server/workspace";

export const metadata = { title: "Driver Intelligence" };

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const ws = await loadWorkspace();
  return (
    <div className="grid max-w-xl gap-8">
      <header>
        <p className="eyebrow">Ask Driver Intelligence</p>
        <h1 className="display mt-3 text-5xl">Ask from the records, not from the air.</h1>
      </header>
      <AskForm initial={q} />
      <div className="flex flex-wrap gap-2">
        {["Why did my score fall?", "What needs renewal?", "Explain my trip.", "Explain this violation.", "Summarize this month."].map((prompt) => (
          <Link key={prompt} href={`/ask?q=${encodeURIComponent(prompt)}`} className="rounded-[10px] border border-line px-3 py-2 text-sm">
            {prompt}
          </Link>
        ))}
      </div>
      <ul className="grid gap-3 text-sm text-muted">
        {ws.questions.map((item) => (
          <li key={item.id}>
            <p className="text-ink">{item.question}</p>
            <p>{item.answer.sections[0]?.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
