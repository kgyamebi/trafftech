import { NotificationSettings } from "@/components/rest-screens";
import { loadWorkspace } from "@/server/workspace";

export const metadata = { title: "Alert preferences" };

export default async function Page() {
  return <NotificationSettings ws={await loadWorkspace()} />;
}
