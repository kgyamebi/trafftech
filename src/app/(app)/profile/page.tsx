import { ProfileScreen } from "@/components/rest-screens";
import { loadWorkspace } from "@/server/workspace";

export const metadata = { title: "Profile" };

export default async function Page() {
  return <ProfileScreen ws={await loadWorkspace()} />;
}
