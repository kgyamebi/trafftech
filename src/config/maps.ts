export type MapProviderId = "open" | "off";

export function mapProviderId(): MapProviderId {
  const value = process.env.NEXT_PUBLIC_MAP_PROVIDER ?? process.env.MAP_PROVIDER ?? "open";
  return value === "off" ? "off" : "open";
}
