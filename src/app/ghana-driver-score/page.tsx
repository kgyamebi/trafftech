import type { Metadata } from "next";
import { GuideView } from "@/components/guide";
import { guides } from "@/content/guides";

export const metadata: Metadata = { title: guides.score.title, description: guides.score.description };

export default function Page() {
  return <GuideView guide={guides.score} />;
}
