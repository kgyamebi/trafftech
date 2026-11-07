import type { Metadata } from "next";
import { GuideView } from "@/components/guide";
import { guides } from "@/content/guides";

export const metadata: Metadata = { title: guides.speed.title, description: guides.speed.description };

export default function Page() {
  return <GuideView guide={guides.speed} />;
}
