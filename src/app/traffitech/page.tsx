import type { Metadata } from "next";
import { GuideView } from "@/components/guide";
import { guides } from "@/content/guides";

export const metadata: Metadata = { title: guides.traffitech.title, description: guides.traffitech.description };

export default function Page() {
  return <GuideView guide={guides.traffitech} />;
}
