"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { ScoreRing } from "./score-ring";

export function Landing() {
  const reduce = useReducedMotion();
  return (
    <div className="bg-drive text-drive-fg">
      <header className="flex items-center justify-between px-5 py-5 sm:px-10">
        <span className="display text-2xl italic text-drive-fg">Nokware</span>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/ghana-driver-guide">Guide</Link>
          <Link href="/login">Sign in</Link>
          <Link href="/signup" className="btn btn-light">Get started</Link>
        </nav>
      </header>
      <section className="grid items-end gap-12 px-5 pb-20 pt-10 sm:px-10 lg:grid-cols-[1.1fr_0.9fr] lg:pt-16">
        <div>
          <div className="lane mb-10 max-w-xs opacity-80" aria-hidden />
          <motion.h1
            className="display text-[4.2rem] leading-none sm:text-8xl"
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 180, damping: 26, delay: 0.15 }}
          >
            Your car.
            <br /> Your road.
            <br /> Your intelligence.
          </motion.h1>
          <p className="mt-6 max-w-md text-lg text-drive-fg/75">A smarter way to understand your driving, vehicle compliance and traffic obligations.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="btn btn-light">Get started</Link>
            <a href="#platform" className="btn border border-white/20 bg-transparent text-drive-fg">Explore the platform</a>
          </div>
        </div>
        <motion.div
          className="rounded-[20px] bg-paper p-6 text-ink"
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, type: "spring", stiffness: 160, damping: 24 }}
        >
          <p className="eyebrow">Preview · not your record</p>
          <div className="mt-4 flex items-center gap-4">
            <ScoreRing value={94} label="Preview score 94" size={132} />
            <div>
              <p className="display text-3xl">You’re ready to drive.</p>
              <p className="mt-2 text-sm text-muted">One thing to know would sit under a real account’s own dates.</p>
            </div>
          </div>
        </motion.div>
      </section>
      <section id="platform" className="bg-paper px-5 py-20 text-ink sm:px-10">
        <p className="eyebrow">The platform</p>
        <div className="mt-8 grid gap-12 lg:grid-cols-2">
          <Block title="Driver score" body="A calculation from drives you record. If there isn’t enough, it says so. Speed is never a prize." />
          <Block title="Vehicle intelligence" body="Insurance, roadworthiness, registration. Dates you enter. No fake DVLA tick." />
          <Block title="Traffic centre" body="Import a notice, confirm a deadline, keep evidence you actually have. Payment stays on the official portal." />
          <Block title="Driver Intelligence" body="Questions answered from your records, with fact separated from inference. It will not tell you that you will win." />
          <Block title="Fleet" body="The same standard for drivers you add. Sample fleets are labelled demo. Real fleets start empty." />
          <Block title="Drive" body="Your speed, the limit you selected, the next change. No cameras. No police pins." />
        </div>
        <div className="mt-16 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
          {[
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
          ].map(([href, label]) => (
            <Link key={href} href={href} className="underline underline-offset-4">{label}</Link>
          ))}
        </div>
        <p className="mt-10 max-w-xl text-xs leading-relaxed text-faint">Nokware is Twi for truth. It is an independent product. TraffiTech, DVLA, the Ghana Police Service and NRSA are external. Educational pages summarise public material and are not official notices.</p>
      </section>
    </div>
  );
}

function Block({ title, body }: { title: string; body: string }) {
  return (
    <article>
      <h2 className="display text-4xl">{title}</h2>
      <p className="mt-3 max-w-md text-muted">{body}</p>
    </article>
  );
}
