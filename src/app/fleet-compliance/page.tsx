import type { Metadata } from "next";
import { GuideView } from "@/components/guide";
import { guides } from "@/content/guides";

export const metadata: Metadata = { title: guides.fleet.title, description: guides.fleet.description };

export default function Page() {
  return <GuideView guide={guides.fleet} />;
}
