import type { Metadata } from "next";
import { GuideView } from "@/components/guide";
import { guides } from "@/content/guides";

export const metadata: Metadata = { title: guides.fines.title, description: guides.fines.description };

export default function Page() {
  return <GuideView guide={guides.fines} />;
}
