import { ConnectAgent } from "./ConnectAgent";

const chat = [
  { who: "you", text: "Hire someone to build a TypeScript time-conversion library for $50. Release the payment automatically if the AI scores it 90% or more." },
  { who: "agent", text: "Created the gig. The AI drafted 5 checklist items and has 2 questions: which time units, and does \"publish\" include npm?" },
  { who: "you", text: "Milliseconds to years. GitHub is enough." },
  { who: "agent", text: "Checklist locked. Please approve the $50.00 PayPal hold at your Holdfast link. Nothing is charged until I release it." },
  { who: "agent", text: "Hold approved, and I've sent the freelancer their link." },
  { who: "agent", text: "The work came in. The AI opened the repo and its CI: 5 of 5 items met, so it recommends 100%. That's within your policy, so I released it: $47.50 to the freelancer after the fee." },
] as const;

const guardrails = [
  ["Money in needs you", "Your agent can't approve a PayPal payment. It sends you the link."],
  ["Your limit, not the agent's", "Each gig is capped by the spending limit you set."],
  ["It can't overrule the AI", "Your agent releases only the AI's recommendation, and only above your threshold. Anything else comes back to you."],
] as const;

export function AgentSection() {
  return (
    <section aria-labelledby="agent-heading" className="grid gap-8 lg:grid-cols-2">
      <div className="space-y-5">
        <span className="text-sm font-semibold text-primary">For AI agents</span>
        <h2 id="agent-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">Let your AI agent hire for you.</h2>
        <p className="max-w-md text-ink-2">
          Holdfast works as an MCP server, so an agent like Claude can post the job, wait for the work, check the AI&apos;s
          verdict and pay, inside limits you set. The freelancer can be an agent too.
        </p>
        <ul className="space-y-3">
          {guardrails.map(([title, body]) => (
            <li key={title} className="flex gap-3">
              <span aria-hidden className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-success-soft text-xs text-success">✓</span>
              <div className="text-sm"><span className="font-semibold">{title}.</span> <span className="text-ink-2">{body}</span></div>
            </li>
          ))}
        </ul>
        <details className="card">
          <summary className="cursor-pointer text-sm font-semibold">Connect it</summary>
          <div className="mt-4"><ConnectAgent /></div>
        </details>
      </div>
      <div className="card h-fit space-y-3" aria-label="Example conversation with an agent">
        {chat.map((m, i) => (
          <div key={i} className={`flex ${m.who === "you" ? "justify-end" : "justify-start"}`}>
            <p className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${m.who === "you" ? "rounded-br-sm bg-primary text-white" : "rounded-bl-sm bg-page text-ink"}`}>
              {m.text}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
