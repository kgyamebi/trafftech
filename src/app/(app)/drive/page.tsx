import { DriveScreen } from "@/components/drive-screen";
import { readDrivePrefs } from "@/server/drive-prefs";
import { loadWorkspace } from "@/server/workspace";

export const metadata = { title: "Drive" };

export default async function DrivePage() {
  const [ws, prefs] = await Promise.all([loadWorkspace(), readDrivePrefs()]);
  return <DriveScreen ws={ws} prefs={prefs} screen={prefs.simple ? "now" : "map"} />;
}
