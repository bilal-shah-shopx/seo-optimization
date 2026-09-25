import { summarizeIssues, type IssueCode } from "../lib/seo/audit";

export function IssueSummary({
  codes,
  max = 2,
  variant = "badges",
}: {
  codes: IssueCode[];
  max?: number;
  variant?: "badges" | "text";
}) {
  if (codes.length === 0) return <s-text color="subdued">No issues</s-text>;

  const { labels, more } = summarizeIssues(codes, max);
  const moreLabel = more > 0 ? `+${more} more` : "";

  if (variant === "text") {
    return (
      <s-text color="subdued">
        {labels.join(" · ")}
        {moreLabel && ` · ${moreLabel}`}
      </s-text>
    );
  }

  return (
    <s-stack direction="inline" gap="small-300" alignItems="center">
      {labels.map((label) => (
        <s-badge key={label}>{label}</s-badge>
      ))}
      {moreLabel && <s-text color="subdued">{moreLabel}</s-text>}
    </s-stack>
  );
}
