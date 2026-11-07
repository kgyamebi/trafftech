import { DriveScreen } from "@/components/drive-screen";
import { readDrivePrefs } from "@/server/drive-prefs";
import { loadWorkspace } from "@/server/workspace";

export const metadata = { title: "Drive" };

export default async function HomePage({ searchParams }: { searchParams: Promise<{ map?: string }> }) {
  const [ws, prefs, query] = await Promise.all([loadWorkspace(), readDrivePrefs(), searchParams]);
  const screen = query.map === "1" ? "map" : prefs.simple ? "now" : "map";
  return <DriveScreen ws={ws} prefs={prefs} screen={screen} />;
}
