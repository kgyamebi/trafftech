import { BriefScreen } from "@/components/rest-screens";
import { readDrivePrefs } from "@/server/drive-prefs";
import { loadWorkspace } from "@/server/workspace";

export const metadata = { title: "Daily brief" };

export default async function Page() {
  const [ws, prefs] = await Promise.all([loadWorkspace(), readDrivePrefs()]);
  return <BriefScreen ws={ws} prefs={prefs} />;
}
