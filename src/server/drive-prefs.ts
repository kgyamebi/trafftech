import "server-only";
import { cookies } from "next/headers";
import { parseDrivePrefs, type DrivePrefs } from "@/domain/drive-prefs";

export async function readDrivePrefs(): Promise<DrivePrefs> {
  const jar = await cookies();
  return parseDrivePrefs(jar.get("nokware_drive")?.value);
}
