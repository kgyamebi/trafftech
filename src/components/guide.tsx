import Link from "next/link";
import type { Guide } from "@/content/guides";

export function GuideView({ guide }: { guide: Guide }) {
  return (
    <article className="mx-auto grid max-w-2xl gap-8 px-5 py-12">
      <Link href="/" className="display text-2xl italic">Nokware</Link>
      <header>
        <p className="eyebrow">{guide.kicker}</p>
        <h1 className="display mt-3 text-5xl sm:text-6xl">{guide.title}</h1>
        <p className="mt-4 text-muted">{guide.description}</p>
      </header>
      {guide.sections.map((section) => (
        <section key={section.heading} className="grid gap-3">
          <h2 className="text-2xl">{section.heading}</h2>
          {section.paragraphs.map((p) => (
            <p key={p.slice(0, 40)} className="text-[15px] leading-relaxed">{p}</p>
          ))}
          {section.list ? (
            <ul className="grid gap-2 pl-4 text-[15px] leading-relaxed">
              {section.list.map((item) => (
                <li key={item.slice(0, 32)} className="list-disc">{item}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
      <footer className="border-t border-line pt-4 text-sm">
        <p className="eyebrow">Sources</p>
        <ul className="mt-3 grid gap-2">
          {guide.sources.map((source) => (
            <li key={source.href}>
              <a className="underline underline-offset-4" href={source.href} target="_blank" rel="noreferrer">{source.label}</a>
            </li>
          ))}
        </ul>
      </footer>
    </article>
  );
}
