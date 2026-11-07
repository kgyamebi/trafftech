import { WorkScreen } from "@/components/work-screen";
import { readDrivePrefs } from "@/server/drive-prefs";
import { loadWorkspace } from "@/server/workspace";

export const metadata = { title: "Work" };

export default async function Page() {
  const [ws, prefs] = await Promise.all([loadWorkspace(), readDrivePrefs()]);
  return <WorkScreen ws={ws} prefs={prefs} />;
}
