import { loadWorkspace } from "@/server/workspace";

export const metadata = { title: "Services" };

const LINES = [
  "Insurance",
  "Roadworthiness",
  "Maintenance",
  "Towing",
  "Tyres",
  "Inspection",
];

export default async function Page() {
  const ws = await loadWorkspace();
  return (
    <div className="grid max-w-xl gap-6">
      <p className="eyebrow">Services</p>
      <h1 className="display text-5xl">Not connected.</h1>
      <p className="text-muted">
        {ws.mode === "demo" ? "DEMO. " : ""}
        Bookings, partners and commissions are not switched on. Nokware will not invent a garage, a price, or a lead.
      </p>
      <ul className="divide-y divide-line border-y border-line text-sm">
        {LINES.map((line) => (
          <li key={line} className="flex min-h-12 items-center justify-between">
            <span>{line}</span>
            <span className="text-muted">Not connected</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
