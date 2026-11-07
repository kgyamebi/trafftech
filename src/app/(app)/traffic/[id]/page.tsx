import { notFound } from "next/navigation";
import { PaymentForm } from "@/components/forms";
import { ViolationDetail } from "@/components/traffic-screen";
import { loadWorkspace } from "@/server/workspace";

export const metadata = { title: "Notice" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await loadWorkspace();
  const violation = ws.violations.find((v) => v.id === id);
  if (!violation) notFound();
  return (
    <div className="grid max-w-2xl gap-10">
      <ViolationDetail ws={ws} id={id} />
      {ws.mode === "user" && violation.status !== "paid_user_reported" ? (
        <PaymentForm violationId={id} amount={violation.amountGhs} />
      ) : null}
    </div>
  );
}
