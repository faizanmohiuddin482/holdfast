import type { Metadata } from "next";
import Link from "next/link";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Holdfast",
  description: "Hire someone without paying blind: PayPal holds the money and an AI checks the work before anyone is paid.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2 text-base font-semibold tracking-tight">
              <span className="grid h-6 w-6 place-items-center rounded-md bg-primary text-xs font-bold text-white" aria-hidden>H</span>
              Holdfast
            </Link>
            <span className="pill bg-warning-soft text-warning">PayPal sandbox</span>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8 sm:py-10">{children}</main>
      </body>
    </html>
  );
}
