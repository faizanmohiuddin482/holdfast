import { NODES, STORY, frame } from "./storyFrames";

const last = NODES.length - 1;
const pos = (i: number) => `${(i / last) * 100}%`;
// Edge chips align to their side so wide labels don't hang off the card on small screens.
const anchor = (i: number) => (i === 0 ? "translate-x-0" : i === last ? "-translate-x-full" : "-translate-x-1/2");
const motion = "transition-all duration-700 ease-out motion-reduce:transition-none";

export function FlowDiagram({ step, compact = false }: { step: number; compact?: boolean }) {
  const f = frame(step);
  return (
    <div className={`rounded-2xl border border-line bg-surface ${compact ? "p-4" : "p-6 sm:p-8"}`} aria-hidden>
      <div className="relative mx-8 h-28">
        {/* track and progress */}
        <div className="absolute top-6 right-0 left-0 h-1 rounded-full bg-line" />
        <div className={`absolute top-6 left-0 h-1 rounded-full bg-primary ${motion}`} style={{ width: pos(f.highlight) }} />
        {/* nodes */}
        {NODES.map((label, i) => (
          <div key={label} className="absolute top-0 flex w-16 -translate-x-1/2 flex-col items-center gap-2 text-center sm:w-20" style={{ left: pos(i) }}>
            <span className={`grid h-13 w-13 place-items-center rounded-full border-2 text-sm font-semibold ${motion} ${
              i === f.highlight ? "scale-110 border-primary bg-primary text-white" : i < f.highlight ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface text-muted"
            }`}>{i + 1}</span>
            <span className={`text-[11px] leading-tight sm:text-xs ${i === f.highlight ? "font-semibold text-ink" : "text-muted"}`}>{label}</span>
          </div>
        ))}
      </div>
      {/* the money */}
      <div className="relative mx-2 mt-2 h-7">
        <div className={`absolute top-0 ${motion} ${anchor(f.moneyAt)}`} style={{ left: pos(f.moneyAt) }}>
          <span className="money pill bg-success-soft whitespace-nowrap text-success">{f.chip}</span>
        </div>
        {f.returned && (
          <div className={`absolute top-0 ${anchor(0)}`} style={{ left: pos(0) }}>
            <span className="money pill bg-page whitespace-nowrap text-ink-2">{f.returned}</span>
          </div>
        )}
      </div>
      {!compact && (
        <ul className="mt-6 space-y-2 border-t border-line pt-5">
          {STORY[f.highlight].detail.map((d, i) => (
            <li key={`${f.highlight}-${d}`} className="animate-[fadeUp_500ms_ease-out_both] text-sm text-ink-2 motion-reduce:animate-none" style={{ animationDelay: `${i * 120}ms` }}>
              {d}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
