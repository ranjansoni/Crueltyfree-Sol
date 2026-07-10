import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Kindr — Find affordable cruelty-free alternatives",
  description: "Find affordable cruelty-free swaps, expected local prices, and stores likely to carry them across Canada and the United States.",
  applicationName: "Kindr",
  icons: { icon: "/favicon.png", shortcut: "/favicon.png" },
  openGraph: {
    type: "website",
    title: "Kindr — Find the kind alternative.",
    description: "Cruelty-free swaps. Local prices.",
    url: "/",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Kindr cruelty-free product finder" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Kindr — Find the kind alternative.",
    description: "Cruelty-free swaps. Local prices.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
