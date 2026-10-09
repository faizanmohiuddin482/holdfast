"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { readSavedGigs, type SavedGig } from "./savedGigs";

export function MyGigs() {
  const [gigs, setGigs] = useState<SavedGig[] | null>(null);
  useEffect(() => setGigs(readSavedGigs()), []);

  return (
    <aside className="card h-fit">
      <h2 className="text-sm font-semibold">Your gigs</h2>
      <p className="hint">Gigs you created in this browser.</p>
      {gigs === null ? null : gigs.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Nothing yet. Gigs you create show up here.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {gigs.map((g) => (
            <li key={g.token}>
              <Link href={`/c/${g.token}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-primary">
                <span className="truncate font-medium">{g.title}</span>
                <span className="money shrink-0 text-muted">{g.amount}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
