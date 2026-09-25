import { getStatus, STATUS_LABELS, type AuditStatus } from "../lib/seo/audit";

const TONES = {
  good: "success",
  needs_work: "warning",
  poor: "critical",
} as const satisfies Record<AuditStatus, string>;

export function ScoreBadge({
  score,
  issueCount,
}: {
  score: number;
  issueCount: number;
}) {
  const status = getStatus(score, issueCount);
  return (
    <s-badge tone={TONES[status]}>
      {score} · {STATUS_LABELS[status]}
    </s-badge>
  );
}
