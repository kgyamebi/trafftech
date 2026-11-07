import { redirect } from "next/navigation";
import { OnboardingScreen } from "@/components/onboarding-screen";
import { getSession } from "@/server/session";
import { readDatabase } from "@/server/store";

export const metadata = { title: "Welcome" };

export default async function Page({ searchParams }: { searchParams: Promise<{ replay?: string }> }) {
  const { replay } = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.mode === "demo") redirect("/home");
  const user = readDatabase().users.find((u) => u.id === session.uid);
  if (user?.onboardingCompleted && replay !== "1") redirect("/home");
  return <OnboardingScreen replay={replay === "1"} />;
}
