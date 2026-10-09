export function ProgressList({ lines, running }: { lines: string[]; running: boolean }) {
  return (
    <ol className="space-y-2 text-sm" aria-live="polite">
      {lines.map((line, i) => (
        <li key={i} className="flex gap-2">
          <span aria-hidden className={line.startsWith("Couldn't") ? "text-warning" : "text-success"}>{line.startsWith("Couldn't") ? "!" : "✓"}</span>
          <span className="break-words text-ink-2">{line}</span>
        </li>
      ))}
      {running && (
        <li className="flex items-center gap-2 text-ink-2">
          <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Working…
        </li>
      )}
    </ol>
  );
}
