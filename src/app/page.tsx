import { MyGigs } from "@/components/MyGigs";
import { NewGigForm } from "@/components/NewGigForm";

const steps = [
  ["Agree", "The AI turns your brief into a checklist you both see."],
  ["Hold", "You pay into escrow. PayPal holds it; nothing is charged."],
  ["Check", "The AI opens the delivered work and checks every item."],
  ["Release", "You approve. The freelancer is paid for what was delivered."],
] as const;

export default function Home() {
  return (
    <div className="space-y-8">
      <section className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Hire someone without paying blind.</h1>
        <p className="mt-3 text-ink-2">
          PayPal holds your money. When the work arrives, an AI checks it against what you agreed and tells you how much was
          delivered. You approve, and only that share is paid.
        </p>
      </section>
      <ol className="grid gap-3 sm:grid-cols-4">
        {steps.map(([title, body], i) => (
          <li key={title} className="rounded-xl border border-line bg-surface p-4">
            <div className="text-xs font-semibold text-primary">Step {i + 1}</div>
            <div className="mt-1 text-sm font-semibold">{title}</div>
            <p className="mt-1 text-xs text-ink-2">{body}</p>
          </li>
        ))}
      </ol>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <NewGigForm />
        <MyGigs />
      </div>
    </div>
  );
}
