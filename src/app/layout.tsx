import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "./providers";

const description = "Call higher or lower with your Chog, level it up, and duel other holders. Live prices, demo money.";

export const metadata: Metadata = {
  metadataBase: new URL("https://chog-league.vercel.app"),
  title: "Chog League",
  description,
  openGraph: { title: "Chog League", description, url: "https://chog-league.vercel.app", siteName: "Chog League", type: "website" },
  twitter: { card: "summary_large_image", title: "Chog League", description },
};

export const viewport: Viewport = { themeColor: "#24124F" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@500;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
