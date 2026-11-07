import { DriveScreen } from "@/components/drive-screen";
import { readDrivePrefs } from "@/server/drive-prefs";
import { loadWorkspace } from "@/server/workspace";

export const metadata = { title: "Driving screen" };

export default async function Page() {
  const [ws, prefs] = await Promise.all([loadWorkspace(), readDrivePrefs()]);
  return <DriveScreen ws={ws} prefs={prefs} screen="now" />;
}
