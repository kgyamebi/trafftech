import { RoadsScreen } from "@/components/roads-screen";
import { loadFieldPage } from "@/server/field-store";
import { loadWorkspace } from "@/server/workspace";

export const metadata = { title: "Local roads" };

export default async function Page() {
  const ws = await loadWorkspace();
  const field = loadFieldPage(ws.mode === "user" ? ws.viewer.id : null, ws.mode);
  return <RoadsScreen field={field} />;
}
