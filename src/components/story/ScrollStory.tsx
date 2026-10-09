"use client";
import { useEffect, useRef, useState } from "react";
import { FlowDiagram } from "./FlowDiagram";
import { STORY } from "./storyFrames";

export function ScrollStory() {
  const [step, setStep] = useState(0);
  const items = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    // A step becomes active when it crosses the middle band of the viewport.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setStep(Number((e.target as HTMLElement).dataset.step));
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    items.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <section aria-labelledby="how-heading" className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <h2 id="how-heading" className="sr-only">How Holdfast works</h2>
      <ol>
        {STORY.map((s, i) => (
          <li key={s.title} ref={(el) => { items.current[i] = el; }} data-step={i}
            className={`flex flex-col justify-center gap-4 py-10 transition-opacity duration-500 motion-reduce:transition-none lg:min-h-[75vh] lg:py-0 ${step === i ? "opacity-100" : "lg:opacity-30"}`}>
            <span className="text-sm font-semibold text-primary">Step {i + 1}</span>
            <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">{s.title}</h3>
            <p className="max-w-md text-ink-2">{s.body}</p>
            <div className="lg:hidden"><FlowDiagram step={i} compact /></div>
          </li>
        ))}
      </ol>
      <div className="hidden lg:block">
        <div className="sticky top-[20vh]"><FlowDiagram step={step} /></div>
      </div>
    </section>
  );
}
