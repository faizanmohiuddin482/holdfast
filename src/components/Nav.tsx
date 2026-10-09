"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Nav() {
  const path = usePathname();
  const items = [
    { href: "/", label: "Gigs", active: path === "/" || path.startsWith("/gigs") },
    { href: "/#how", label: "How it works", active: false },
  ];
  return (
    <nav className="flex items-center gap-5 text-xs tracking-[0.12em] uppercase">
      {items.map((i) => (
        <Link key={i.label} href={i.href} className={`pb-0.5 ${i.active ? "border-b-[3px] border-yellow font-bold" : "hover:text-blue"}`}>
          {i.label}
        </Link>
      ))}
      <span className="chip border-warn text-warn">Sandbox</span>
    </nav>
  );
}
