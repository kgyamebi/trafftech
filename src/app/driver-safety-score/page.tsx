import type { Metadata } from "next";
import { GuideView } from "@/components/guide";
import { guides } from "@/content/guides";

export const metadata: Metadata = { title: guides.safety.title, description: guides.safety.description };

export default function Page() {
  return <GuideView guide={guides.safety} />;
}
