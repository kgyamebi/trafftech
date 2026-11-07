import { InboxForm } from "@/components/forms";
import { OFFICIAL_FINE_CHANNELS } from "@/domain/fines";
import { loadWorkspace } from "@/server/workspace";

export const metadata = { title: "Import a notice" };

export default async function Page() {
  const ws = await loadWorkspace();
  return (
    <div className="grid max-w-xl gap-6">
      <header>
        <p className="eyebrow">Traffic inbox</p>
        <h1 className="display text-5xl">Paste a notice.</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">Nokware will structure what it can read. Saving marks it as imported by you. A pattern match is not proof the message is official.</p>
      </header>
      <InboxForm ws={ws} />
      <aside className="text-sm leading-relaxed text-muted">
        <p>Public guidance says official TraffiTech texts come from GPS-MTTD, without a clickable link, and without a normal 10-digit sender. Payment is published on {OFFICIAL_FINE_CHANNELS.payShortCode} and the NIB portal. Report suspicious demands to {OFFICIAL_FINE_CHANNELS.emergency} or {OFFICIAL_FINE_CHANNELS.tollFree}.</p>
      </aside>
    </div>
  );
}
