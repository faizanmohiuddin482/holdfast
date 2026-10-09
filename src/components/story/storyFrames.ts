// The landing-page story: what happens at each step, and where the money is.
// Example numbers: a $150 gig, 80% delivered, 5% platform fee on the released share.
export const NODES = ["Client", "PayPal holds it", "AI checks", "Freelancer"] as const;

export const STORY = [
  {
    title: "You agree on what done means",
    body: "Describe the job in plain words. The AI turns it into a checklist anyone could verify, and points out anything unclear before money is involved.",
    detail: ["Built in TypeScript", "Public GitHub repo", "README with examples", "Tests pass in CI"],
  },
  {
    title: "PayPal holds the money",
    body: "You approve a PayPal payment hold. PayPal authorizes the payment and holds it. You're not charged, and the freelancer can see the money is really there.",
    detail: ["$150.00 authorized", "Not captured", "Freelancer can start"],
  },
  {
    title: "The AI checks the work",
    body: "The freelancer submits links. The AI opens them, reads the repo and its CI results, and judges every checklist item with evidence. Instructions hidden in the submission are ignored.",
    detail: ["✓ TypeScript library", "✓ Public repo", "◐ README: one direction only", "✓ CI: tests passed"],
  },
  {
    title: "You release what was delivered",
    body: "The AI shows how much was delivered and how it worked that out. You approve, PayPal pays the freelancer for that share, and the rest goes back to you automatically.",
    detail: ["80% released", "$114 to the freelancer after fees", "$30 back to you"],
  },
] as const;

const FRAMES = [
  { highlight: 0, moneyAt: 0, chip: "$150 in your PayPal", returned: null },
  { highlight: 1, moneyAt: 1, chip: "$150 held", returned: null },
  { highlight: 2, moneyAt: 1, chip: "$150 still held", returned: null },
  { highlight: 3, moneyAt: 3, chip: "$114 paid", returned: "$30 back to you" },
] as const;

export function frame(step: number) {
  return FRAMES[Math.min(FRAMES.length - 1, Math.max(0, Math.round(step)))];
}
