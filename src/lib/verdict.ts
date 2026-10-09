// The release percentage is computed by the app from the AI's per-criterion judgments,
// so the number a client approves is explainable and repeatable.

export type CriterionStatus = "met" | "partially_met" | "not_met" | "cannot_verify";

const SCORE: Record<CriterionStatus, number> = { met: 1, partially_met: 0.5, not_met: 0, cannot_verify: 0 };

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function computeRelease(
  criteria: { id: string; weight: number }[],
  results: { criterionId: string; status: CriterionStatus }[],
) {
  const byId = new Map(results.map((r) => [r.criterionId, r.status]));
  let earned = 0;
  let total = 0;
  const parts: string[] = [];
  for (const c of criteria) {
    const points = c.weight * SCORE[byId.get(c.id) ?? "cannot_verify"];
    earned += points;
    total += c.weight;
    parts.push(`${c.id} ${num(points)}/${c.weight}`);
  }
  const percent = total ? Math.round((100 * earned) / total) : 0;
  return { percent, earned, total, working: `${parts.join(" · ")} → ${num(earned)}/${total} = ${percent}%` };
}
