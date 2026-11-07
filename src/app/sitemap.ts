import type { MetadataRoute } from "next";

const paths = [
  "",
  "/ghana-speed-limits",
  "/traffitech",
  "/ghana-traffic-fines",
  "/traffic-fine-calculator",
  "/vehicle-compliance",
  "/ghana-driver-guide",
  "/traffic-violation-guide",
  "/vehicle-transfer-guide",
  "/ghana-roadworthiness",
  "/ghana-driver-score",
  "/driver-safety-score",
  "/insurance-renewal-guide",
  "/fleet-compliance",
  "/login",
  "/signup",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return paths.map((path) => ({
    url: `https://nokware.app${path}`,
    changeFrequency: "monthly",
    priority: path === "" ? 1 : 0.6,
  }));
}
