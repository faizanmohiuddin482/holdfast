// Chunked pixel progress bar (the deck's LVL bar): fills in visible 5% blocks, never a smooth sweep.
export function ProgressBar({ percent, label }: { percent: number; label: string }) {
  const filled = Math.round(Math.min(100, Math.max(0, percent)) / 5);
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}
      className="flex h-5 gap-[2px] border-2 border-ink bg-bg p-[2px]">
      {Array.from({ length: 20 }, (_, i) => (
        <span key={i} className={`flex-1 ${i < filled ? "bg-yellow" : "bg-blue-tint"}`} />
      ))}
    </div>
  );
}
