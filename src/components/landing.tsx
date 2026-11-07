"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { ScoreRing } from "./score-ring";

const GUIDES = [
  ["/ghana-speed-limits", "Speed limits"],
  ["/traffitech", "TraffiTech"],
  ["/ghana-traffic-fines", "Fines"],
  ["/traffic-fine-calculator", "Fine calculator"],
  ["/vehicle-compliance", "Compliance"],
  ["/ghana-driver-guide", "Driver guide"],
  ["/traffic-violation-guide", "Violations"],
  ["/vehicle-transfer-guide", "Transfer"],
  ["/ghana-roadworthiness", "Roadworthiness"],
  ["/ghana-driver-score", "Driver score"],
  ["/insurance-renewal-guide", "Insurance"],
  ["/fleet-compliance", "Fleet"],
] as const;

const STORIES = [
  {
    title: "Drive",
    body: "Your speed, the limit you selected, the next change. No cameras. No police pins.",
    src: "/home/drive.jpg",
    alt: "A driver at the wheel, with a phone showing a simple route line.",
    className: "min-h-[460px] lg:col-span-7 lg:row-span-2 lg:min-h-[560px]",
  },
  {
    title: "Reports",
    body: "A report other drivers have confirmed can be named near a route. The route order stays the same.",
    src: "/home/street.jpg",
    alt: "A cream car and a patterned minibus on a tree-lined street at dusk.",
    className: "min-h-[280px] lg:col-span-5",
  },
  {
    title: "Keeps itself current",
    body: "What drivers choose to share can update what others later see. An empty record stays unknown. Nothing here is an official notice.",
    src: "/home/hills.jpg",
    alt: "An empty road curving through misty green hills.",
    className: "min-h-[300px] lg:col-span-5",
  },
] as const;

const BLOCKS = [
  ["Driver score", "A calculation from drives you record. If there isn’t enough, it says so. Speed is never a prize."],
  ["Vehicle intelligence", "Insurance, roadworthiness, registration. Dates you enter. No fake DVLA tick."],
  ["Traffic centre", "Import a notice, confirm a deadline, keep evidence you actually have. Payment stays on the official portal."],
  ["Driver Intelligence", "Questions answered from your records, with fact separated from inference. It will not tell you that you will win."],
  ["Fleet", "The same standard for drivers you add. Sample fleets are labelled demo. Real fleets start empty."],
] as const;

export function Landing() {
  const reduce = useReducedMotion();
  const rise = (delay = 0) =>
    reduce
      ? { duration: 0 }
      : { type: "spring" as const, stiffness: 260, damping: 24, delay };

  return (
    <div id="content" className="bg-paper text-ink">
      <header className="fixed inset-x-0 top-0 z-30 flex items-center justify-between bg-paper/85 px-5 py-3 backdrop-blur-md sm:px-8">
        <Link href="/" className="display text-2xl italic">Nokware</Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/ghana-driver-guide">Guide</Link>
          <Link href="/login">Sign in</Link>
          <Link href="/signup" className="btn">Get started</Link>
        </nav>
      </header>

      <section className="relative isolate min-h-[100svh] overflow-hidden">
        <img
          src="/home/hero.jpg"
          alt="A quiet motorway at golden hour, lined with palms and rain trees."
          fetchPriority="high"
          className="home-hero-photo absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(16,17,14,0.28),rgba(16,17,14,0.08)_38%,rgba(16,17,14,0.62))]" />
        <div className="relative flex min-h-[100svh] flex-col items-center justify-center px-5 pb-36 pt-28 text-center text-drive-fg">
          <motion.p
            className="text-sm font-medium tracking-wide text-drive-fg/85"
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={rise(0.05)}
          >
            For the drive in front of you
          </motion.p>
          <h1 className="display mt-4 max-w-4xl text-[3.3rem] leading-[0.92] sm:text-7xl lg:text-8xl">
            {["A clearer drive,", "made for this road."].map((line, index) => (
              <motion.span
                key={line}
                className="block"
                initial={reduce ? false : { opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={rise(0.1 + index * 0.08)}
              >
                {line}
              </motion.span>
            ))}
          </h1>
          <motion.p
            className="mt-5 max-w-md text-lg text-drive-fg/80"
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={rise(0.3)}
          >
            Your car. Your road. Your intelligence.
          </motion.p>
          <motion.div
            className="mt-8 flex flex-wrap justify-center gap-3"
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={rise(0.4)}
          >
            <Link href="/signup" className="btn btn-light !rounded-full px-6">Get started</Link>
            <a href="#platform" className="btn !rounded-full !border !border-white/35 !bg-white/10 !text-drive-fg px-6 backdrop-blur-sm">Explore</a>
          </motion.div>
        </div>
      </section>

      <section className="relative z-10 -mt-36 bg-drive px-3 pb-6 sm:-mt-44 sm:px-6" aria-label="Sample route">
        <motion.div
          className="mx-auto max-w-[1240px]"
          initial={reduce ? false : { opacity: 0, y: 36 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={rise(0)}
        >
          <SampleMap />
        </motion.div>
      </section>

      <section className="bg-drive px-5 pb-20 pt-16 text-drive-fg sm:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="display text-4xl sm:text-6xl">Built around the drive you actually take.</h2>
          <p className="mx-auto mt-5 max-w-xl text-drive-fg/75">
            Records you keep, places drivers add, and a map that says when it does not know.
          </p>
        </div>
      </section>

      <section id="platform" className="bg-paper px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-12">
          {STORIES.map((story, index) => (
            <motion.article
              key={story.title}
              className={`group relative flex overflow-hidden rounded-[28px] ${story.className}`}
              initial={reduce ? false : { opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={rise(index * 0.05)}
            >
              <img src={story.src} alt={story.alt} className="home-shot absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(16,17,14,0.78),rgba(16,17,14,0.05)_58%)]" />
              <div className="relative z-10 mt-auto p-6 text-drive-fg sm:p-8">
                <h2 className="display text-4xl">{story.title}</h2>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-drive-fg/85 sm:text-base">{story.body}</p>
              </div>
            </motion.article>
          ))}
        </div>

        <div className="mx-auto mt-16 grid max-w-6xl items-start gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <motion.div
            className="rounded-[28px] bg-raised p-7 shadow-soft"
            initial={reduce ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={rise(0)}
          >
            <p className="eyebrow">Preview · not your record</p>
            <div className="mt-5 flex items-center gap-4">
              <ScoreRing value={94} label="Preview score 94. Not your record." size={120} />
              <div>
                <p className="display text-3xl">A real account starts empty.</p>
                <p className="mt-2 text-sm text-muted">A short record stays unscored. Speed is never a prize.</p>
              </div>
            </div>
          </motion.div>
          <div className="grid gap-8 sm:grid-cols-2">
            {BLOCKS.map(([title, body], index) => (
              <Block key={title} title={title} body={body} index={index} reduce={Boolean(reduce)} />
            ))}
          </div>
        </div>

        <div className="mx-auto mt-16 flex max-w-6xl flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
          {GUIDES.map(([href, label]) => (
            <Link key={href} href={href} className="underline underline-offset-4">{label}</Link>
          ))}
        </div>
        <p className="mx-auto mt-10 max-w-6xl text-xs leading-relaxed text-faint">
          Nokware is Twi for truth. It is an independent product. TraffiTech, DVLA, the Ghana Police Service and NRSA are external. Educational pages summarise public material and are not official notices.
        </p>
      </section>

      <section className="bg-ink px-5 py-20 text-center text-drive-fg sm:px-8">
        <h2 className="display mx-auto max-w-3xl text-4xl sm:text-6xl">Start with your own record.</h2>
        <p className="mx-auto mt-4 max-w-md text-drive-fg/70">Nothing on this page is filled in as yours.</p>
        <Link href="/signup" className="btn btn-light mt-8 !rounded-full px-6">Get started</Link>
      </section>
    </div>
  );
}

function SampleMap() {
  const reduce = useReducedMotion();
  return (
    <div className="overflow-hidden rounded-[28px] bg-[#e7efe4] shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
      <div className="relative">
      <svg viewBox="0 0 1000 560" className="block h-auto w-full" role="img" aria-label="A sample drawing from Madina to Airport. Not a live map.">
        <rect width="1000" height="560" fill="#e7efe4" />
        <path d="M0 400 C140 360 200 500 20 560 L0 560 Z" fill="#c9dfd8" />
        <path d="M720 450 C840 400 980 490 1000 430 L1000 560 L680 560 Z" fill="#d7e7e1" />
        <g stroke="#ddd6c8" strokeWidth="4" fill="none">
          <path d="M0 90 H1000" />
          <path d="M0 190 H1000" />
          <path d="M0 300 H1000" />
          <path d="M0 410 H1000" />
          <path d="M150 0 V560" />
          <path d="M330 0 V560" />
          <path d="M510 0 V560" />
          <path d="M690 0 V560" />
          <path d="M860 0 V560" />
        </g>
        <g stroke="#b7b1a4" strokeWidth="8" fill="none" strokeLinecap="round">
          <path d="M0 250 C220 220 420 290 1000 180" />
          <path d="M470 0 C490 160 500 320 540 560" />
        </g>
        <path className="home-route" d="M200 460 C340 400 430 350 520 300 S700 190 840 148" fill="none" stroke="#8a6234" strokeWidth="7" strokeLinecap="round" />
        <circle cx="200" cy="460" r="9" fill="#17653e" />
        <circle cx="840" cy="148" r="9" fill="#8e2d2d" />
        <text x="218" y="454" fill="#161712" fontSize="22" fontFamily="Fraunces, Georgia, serif">Madina</text>
        <text x="724" y="128" fill="#161712" fontSize="22" fontFamily="Fraunces, Georgia, serif">Airport</text>
      </svg>
      <motion.span
        aria-hidden
        className="absolute z-20 h-3.5 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink shadow-[0_8px_18px_rgba(22,23,18,0.35)] ring-2 ring-white"
        initial={{ left: "20%", top: "82%" }}
        animate={reduce ? { left: "52%", top: "48%" } : { left: ["20%", "42%", "64%", "84%"], top: ["82%", "60%", "40%", "26%"] }}
        transition={reduce ? { duration: 0 } : { duration: 14, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
      />
      <div className="pointer-events-none absolute right-4 top-4 home-chip hidden rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-ink shadow-soft sm:block">Not live traffic</div>
      <div className="pointer-events-none absolute bottom-5 right-5 home-chip home-chip-late hidden max-w-[14rem] rounded-2xl bg-ink/90 px-3 py-2 text-xs leading-snug text-drive-fg sm:block">A sample drawing. Not a live arrival.</div>
      <div className="absolute left-4 top-4 hidden w-[280px] sm:block">
        <SampleCard />
      </div>
      </div>
      <div className="bg-white p-3 sm:hidden">
        <SampleCard />
      </div>
    </div>
  );
}

function SampleCard() {
  return (
    <div className="rounded-2xl bg-white/95 p-3 shadow-soft backdrop-blur-sm sm:shadow-soft">
      <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Sample</p>
      <div className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm">
        <span className="h-2.5 w-2.5 rounded-full bg-good" aria-hidden />
        <span>Madina</span>
      </div>
      <div className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm">
        <span className="h-2.5 w-2.5 rounded-full bg-bad" aria-hidden />
        <span>Airport</span>
      </div>
      <p className="px-2 pt-1 text-xs text-muted">Not a live arrival.</p>
      <Link href="/signup" className="btn mt-2 w-full !rounded-full">Get started</Link>
    </div>
  );
}

function Block({ title, body, index, reduce }: { title: string; body: string; index: number; reduce: boolean }) {
  return (
    <motion.article
      initial={reduce ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 24, delay: (index % 2) * 0.05 }}
    >
      <h2 className="display text-3xl">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-muted">{body}</p>
    </motion.article>
  );
}
