import type { Metadata } from "next";
import Link from "next/link";
import { FineCalculator } from "@/components/calculator";

export const metadata: Metadata = {
  title: "Traffic fine calculator",
  description: "An educational estimate of publicly reported Ghana TraffiTech fine bands. The notice amount controls.",
};

export default function Page() {
  return (
    <main className="mx-auto grid max-w-xl gap-6 px-5 py-12">
      <Link href="/" className="display text-2xl italic">Nokware</Link>
      <h1 className="display text-5xl">Traffic fine calculator</h1>
      <p className="text-sm text-muted">Educational only. This does not look up a ticket and it does not take payment.</p>
      <FineCalculator />
    </main>
  );
}
