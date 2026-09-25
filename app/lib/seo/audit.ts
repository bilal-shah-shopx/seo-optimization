export const SEO_TITLE_MAX = 60;
export const META_DESC_MAX = 160;
export const DESCRIPTION_MIN = 100;
export const STALE_SCAN_DAYS = 7;

export type IssueCode =
  | "SEO_TITLE_NOT_CUSTOMIZED"
  | "SEO_TITLE_TOO_LONG"
  | "META_DESC_MISSING"
  | "META_DESC_TOO_LONG"
  | "DESCRIPTION_WEAK"
  | "IMAGE_ALT_MISSING"
  | "NO_IMAGES";

export type AuditStatus = "good" | "needs_work" | "poor";

export interface AuditImage {
  id: string;
  alt: string | null;
}

export interface AuditInput {
  title: string;
  description: string;
  seoTitle: string | null;
  seoDescription: string | null;
  images: AuditImage[];
}

export interface Issue {
  code: IssueCode;
  message: string;
  deduction: number;
  imageIds?: string[];
}

export interface AuditResult {
  score: number;
  issues: Issue[];
  status: AuditStatus;
}

export const DEDUCTIONS: Record<IssueCode, number> = {
  SEO_TITLE_NOT_CUSTOMIZED: 20,
  SEO_TITLE_TOO_LONG: 10,
  META_DESC_MISSING: 20,
  META_DESC_TOO_LONG: 10,
  DESCRIPTION_WEAK: 20,
  IMAGE_ALT_MISSING: 10,
  NO_IMAGES: 10,
};

export function clampScore(score: number): number {
  return Math.min(100, Math.max(0, Math.round(score)));
}

export function getStatus(score: number, issueCount: number): AuditStatus {
  if (issueCount === 0) return "good";
  return score >= 50 ? "needs_work" : "poor";
}

export function auditProduct(input: AuditInput): AuditResult {
  const issues: Issue[] = [];
  const add = (code: IssueCode, message: string, imageIds?: string[]) =>
    issues.push({ code, message, deduction: DEDUCTIONS[code], imageIds });

  const seoTitle = (input.seoTitle ?? "").trim();
  const seoDescription = (input.seoDescription ?? "").trim();
  const description = input.description.trim();

  if (!seoTitle) {
    add(
      "SEO_TITLE_NOT_CUSTOMIZED",
      "Shopify is currently using the product title as the storefront fallback.",
    );
  } else if (seoTitle.length > SEO_TITLE_MAX) {
    add(
      "SEO_TITLE_TOO_LONG",
      `The SEO title is ${seoTitle.length} characters, so search results will cut it off.`,
    );
  }

  if (!seoDescription) {
    add(
      "META_DESC_MISSING",
      "Search engines will pick their own snippet, usually from the product description.",
    );
  } else if (seoDescription.length > META_DESC_MAX) {
    add(
      "META_DESC_TOO_LONG",
      `The meta description is ${seoDescription.length} characters, so search results will cut it off.`,
    );
  }

  if (description.length < DESCRIPTION_MIN) {
    add(
      "DESCRIPTION_WEAK",
      description
        ? `The product description is only ${description.length} characters. Thin content ranks poorly.`
        : "The product has no description. Thin content ranks poorly.",
    );
  }

  if (input.images.length === 0) {
    add(
      "NO_IMAGES",
      "Products without images get fewer clicks and can't appear in image search.",
    );
  } else {
    const missingAlt = input.images
      .filter((image) => !(image.alt ?? "").trim())
      .map((image) => image.id);
    if (missingAlt.length > 0) {
      add(
        "IMAGE_ALT_MISSING",
        `${missingAlt.length} of ${input.images.length} images have no alt text, so search engines and screen readers can't describe them.`,
        missingAlt,
      );
    }
  }

  const score = clampScore(
    100 - issues.reduce((total, issue) => total + issue.deduction, 0),
  );

  return { score, issues, status: getStatus(score, issues.length) };
}

export function isScanStale(
  lastScannedAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!lastScannedAt) return true;
  const ageMs = now.getTime() - new Date(lastScannedAt).getTime();
  return ageMs > STALE_SCAN_DAYS * 24 * 60 * 60 * 1000;
}

export const STATUS_LABELS: Record<AuditStatus, string> = {
  good: "Good",
  needs_work: "Needs work",
  poor: "Poor",
};

export const ISSUE_LABELS: Record<IssueCode, string> = {
  SEO_TITLE_NOT_CUSTOMIZED: "SEO title not customized",
  SEO_TITLE_TOO_LONG: "SEO title too long",
  META_DESC_MISSING: "Missing meta description",
  META_DESC_TOO_LONG: "Meta description too long",
  DESCRIPTION_WEAK: "Short product description",
  IMAGE_ALT_MISSING: "Missing image alt text",
  NO_IMAGES: "No product images",
};

export const ISSUE_FIXES: Record<IssueCode, string> = {
  SEO_TITLE_NOT_CUSTOMIZED: `Add a custom SEO title up to ${SEO_TITLE_MAX} characters.`,
  SEO_TITLE_TOO_LONG: `Shorten the SEO title to ${SEO_TITLE_MAX} characters or fewer.`,
  META_DESC_MISSING: `Write a meta description up to ${META_DESC_MAX} characters.`,
  META_DESC_TOO_LONG: `Shorten the meta description to ${META_DESC_MAX} characters or fewer.`,
  DESCRIPTION_WEAK: `Expand the product description to at least ${DESCRIPTION_MIN} characters in Shopify.`,
  IMAGE_ALT_MISSING: "Add descriptive alt text to each image marked below.",
  NO_IMAGES: "Add at least one product image in Shopify.",
};

export function parseIssues(json: string): Issue[] {
  try {
    const issues = JSON.parse(json);
    return Array.isArray(issues) ? issues : [];
  } catch {
    return [];
  }
}

// Labels for compact lists: the first `max` labels plus how many were left out.
export function summarizeIssues(codes: IssueCode[], max = 2) {
  const labels = codes.map((code) => ISSUE_LABELS[code] ?? code);
  return {
    labels: labels.slice(0, max),
    more: Math.max(0, labels.length - max),
  };
}
