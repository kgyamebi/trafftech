import { SettingsScreen } from "@/components/rest-screens";
import { readDrivePrefs } from "@/server/drive-prefs";
import { loadWorkspace } from "@/server/workspace";

export const metadata = { title: "Settings" };

export default async function Page() {
  const [ws, prefs] = await Promise.all([loadWorkspace(), readDrivePrefs()]);
  return <SettingsScreen ws={ws} prefs={prefs} />;
}
