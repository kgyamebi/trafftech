import type { Metadata } from "next";
import { GuideView } from "@/components/guide";
import { guides } from "@/content/guides";

export const metadata: Metadata = { title: guides.transfer.title, description: guides.transfer.description };

export default function Page() {
  return <GuideView guide={guides.transfer} />;
}
