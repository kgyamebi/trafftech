import { DriveScreen } from "@/components/drive-screen";
import { readDrivePrefs } from "@/server/drive-prefs";
import { loadMapMarks } from "@/server/field-store";
import { loadWorkspace } from "@/server/workspace";

export const metadata = { title: "Driving screen" };

export default async function Page() {
  const [ws, prefs] = await Promise.all([loadWorkspace(), readDrivePrefs()]);
  return <DriveScreen ws={ws} prefs={prefs} marks={loadMapMarks(ws.mode)} screen="now" />;
}
