import type { Metadata, Viewport } from "next";
import { Fraunces, Outfit } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Nokware", template: "%s · Nokware" },
  description: "The operating system for Ghanaian drivers. Status, speed limits, vehicle compliance and traffic obligations — without pretending to be the authorities.",
  applicationName: "Nokware",
  metadataBase: new URL("https://nokware.app"),
};

export const viewport: Viewport = {
  themeColor: "#f3f0e8",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${outfit.variable}`}>
      <body>
        <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-raised focus:px-3 focus:py-2">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
