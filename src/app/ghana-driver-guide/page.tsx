import type { Metadata } from "next";
import { GuideView } from "@/components/guide";
import { guides } from "@/content/guides";

export const metadata: Metadata = { title: guides.driver.title, description: guides.driver.description };

export default function Page() {
  return <GuideView guide={guides.driver} />;
}
