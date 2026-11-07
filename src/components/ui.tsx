import clsx from "clsx";
import { sourceLabel } from "@/domain/dates";
import type { Tone } from "@/domain/types";

const toneText: Record<Tone, string> = {
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
  info: "text-info",
  neutral: "text-muted",
};

const toneDot: Record<Tone, string> = {
  good: "bg-good",
  warn: "bg-warn",
  bad: "bg-bad",
  info: "bg-info",
  neutral: "bg-faint",
};

export function Status({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={clsx("inline-flex items-center gap-2 text-[13px] font-medium", toneText[tone])}>
      <span className={clsx("h-1.5 w-1.5 rounded-full", toneDot[tone])} aria-hidden />
      {children}
    </span>
  );
}

export function Source({ source }: { source: string }) {
  return <span className="eyebrow">{sourceLabel(source)}</span>;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="card px-6 py-10">
      <p className="eyebrow">Nothing here</p>
      <h2 className="display mt-3 text-4xl">{title}</h2>
      <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted">{body}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function ErrorNote({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[16px] border border-bad/20 bg-bad-soft px-5 py-4" role="alert">
      <p className="font-medium text-bad">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-ink/80">{body}</p>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("skeleton", className)} aria-hidden />;
}

export function PageIntro({ kicker, title, body }: { kicker: string; title: string; body?: string }) {
  return (
    <header className="max-w-xl">
      <p className="eyebrow">{kicker}</p>
      <h1 className="display mt-3 text-[2.6rem] sm:text-5xl">{title}</h1>
      {body ? <p className="mt-3 text-[15px] leading-relaxed text-muted">{body}</p> : null}
    </header>
  );
}
