import type { Metadata } from "next";
import Link from "next/link";
import { IBM_Plex_Mono, Playfair_Display } from "next/font/google";
import { Nav } from "@/components/Nav";
import "./globals.css";

const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "700"] });
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin"], style: ["italic"], weight: ["400"] });

export const metadata: Metadata = {
  title: "Holdfast",
  description: "Escrow for freelance work, released by an AI agent that checks the deliverable.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${plexMono.variable} ${playfair.variable} antialiased`}>
        <header className="border-b-2 border-ink bg-bg">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <Link href="/" className="t-h2 tracking-[0.12em]">
              <span className="mr-2 inline-block h-3 w-3 bg-blue align-middle" aria-hidden />
              Holdfast
            </Link>
            <Nav />
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-8 sm:py-12">{children}</main>
      </body>
    </html>
  );
}
