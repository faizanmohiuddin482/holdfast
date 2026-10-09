// The browser remembers the client links of gigs created here. It's a convenience only:
// the server never lists gigs, because a client link is the key to releasing money.
export type SavedGig = { token: string; title: string; amount: string; createdAt: string };
type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void };

const KEY = "holdfast:my-gigs";

function defaultStore(): Store | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function readSavedGigs(store: Store | undefined = defaultStore()): SavedGig[] {
  try {
    const list = JSON.parse(store?.getItem(KEY) ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveGig(gig: SavedGig, store: Store | undefined = defaultStore()) {
  try {
    const rest = readSavedGigs(store).filter((g) => g.token !== gig.token);
    store?.setItem(KEY, JSON.stringify([gig, ...rest].slice(0, 50)));
  } catch {
    // Storage full or blocked: the gig still exists, the list just won't show it.
  }
}
