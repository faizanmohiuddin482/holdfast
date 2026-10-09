import { MyGigs } from "@/components/MyGigs";
import { NewGigForm } from "@/components/NewGigForm";
import { ScrollStory } from "@/components/story/ScrollStory";

export default function Home() {
  return (
    <div className="space-y-16">
      <section className="flex min-h-[60vh] flex-col justify-center">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">Hire someone without paying blind.</h1>
        <p className="mt-5 max-w-2xl text-lg text-ink-2">
          PayPal holds your money. When the work arrives, an AI checks it against what you agreed and tells you how much was
          delivered. You approve, and only that share is paid.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <a href="#start" className="btn px-6 py-3 text-base">Hire someone</a>
          <span className="text-sm text-muted">Scroll to see how it works ↓</span>
        </div>
      </section>
      <ScrollStory />
      <section id="start" className="scroll-mt-24 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <NewGigForm />
        <MyGigs />
      </section>
    </div>
  );
}
