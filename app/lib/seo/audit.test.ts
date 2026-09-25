import { test } from "node:test";
import assert from "node:assert/strict";
import {
  auditProduct,
  clampScore,
  getStatus,
  isScanStale,
  ISSUE_FIXES,
  ISSUE_LABELS,
  summarizeIssues,
  type AuditInput,
} from "./audit.ts";

const good: AuditInput = {
  title: "Organic Cotton Tee",
  description: "A".repeat(120),
  seoTitle: "Organic Cotton Tee | Soft & Sustainable",
  seoDescription: "Soft, breathable organic cotton tee made to last.",
  images: [{ id: "img1", alt: "Front view of tee" }],
};

const codes = (input: AuditInput) =>
  auditProduct(input).issues.map((issue) => issue.code);

test("fully optimized product scores 100 and is good", () => {
  const result = auditProduct(good);
  assert.equal(result.score, 100);
  assert.deepEqual(result.issues, []);
  assert.equal(result.status, "good");
});

test("empty SEO title is flagged as not customized (-20)", () => {
  const result = auditProduct({ ...good, seoTitle: "   " });
  assert.deepEqual(codes({ ...good, seoTitle: null }), [
    "SEO_TITLE_NOT_CUSTOMIZED",
  ]);
  assert.equal(result.score, 80);
  assert.match(result.issues[0].message, /product title/);
});

test("SEO title over 60 characters (-10); exactly 60 passes", () => {
  assert.equal(auditProduct({ ...good, seoTitle: "x".repeat(61) }).score, 90);
  assert.deepEqual(codes({ ...good, seoTitle: "x".repeat(60) }), []);
});

test("missing meta description (-20)", () => {
  const result = auditProduct({ ...good, seoDescription: "" });
  assert.deepEqual(codes({ ...good, seoDescription: "" }), [
    "META_DESC_MISSING",
  ]);
  assert.equal(result.score, 80);
});

test("meta description over 160 characters (-10); exactly 160 passes", () => {
  assert.equal(
    auditProduct({ ...good, seoDescription: "x".repeat(161) }).score,
    90,
  );
  assert.deepEqual(codes({ ...good, seoDescription: "x".repeat(160) }), []);
});

test("product description under 100 characters or empty (-20)", () => {
  assert.equal(auditProduct({ ...good, description: "short" }).score, 80);
  assert.equal(auditProduct({ ...good, description: "" }).score, 80);
  assert.deepEqual(codes({ ...good, description: "x".repeat(100) }), []);
});

test("images missing alt text deduct once (-10) and list each image", () => {
  const result = auditProduct({
    ...good,
    images: [
      { id: "a", alt: "" },
      { id: "b", alt: null },
      { id: "c", alt: "ok" },
    ],
  });
  assert.equal(result.score, 90);
  assert.equal(result.issues.length, 1);
  assert.deepEqual(result.issues[0].imageIds, ["a", "b"]);
});

test("no images (-10) without an alt text issue", () => {
  const result = auditProduct({ ...good, images: [] });
  assert.deepEqual(codes({ ...good, images: [] }), ["NO_IMAGES"]);
  assert.equal(result.score, 90);
});

test("worst case is poor and scores stay within 0-100", () => {
  const result = auditProduct({
    title: "Tee",
    description: "",
    seoTitle: null,
    seoDescription: null,
    images: [],
  });
  assert.equal(result.score, 30);
  assert.equal(result.status, "poor");
  assert.equal(clampScore(-40), 0);
  assert.equal(clampScore(140), 100);
});

test("status thresholds", () => {
  assert.equal(getStatus(100, 0), "good");
  assert.equal(getStatus(90, 1), "needs_work");
  assert.equal(getStatus(50, 2), "needs_work");
  assert.equal(getStatus(49, 3), "poor");
});

test("scan staleness", () => {
  const now = new Date("2026-09-24T00:00:00Z");
  assert.equal(isScanStale(null, now), true);
  assert.equal(isScanStale(new Date("2026-09-20T00:00:00Z"), now), false);
  assert.equal(isScanStale(new Date("2026-09-10T00:00:00Z"), now), true);
});

test("every issue code has a label and a fix", () => {
  const result = auditProduct({
    title: "Tee",
    description: "",
    seoTitle: "x".repeat(61),
    seoDescription: "x".repeat(161),
    images: [{ id: "a", alt: null }],
  });
  const all = [
    ...result.issues.map((issue) => issue.code),
    ...codes({ ...good, seoTitle: null, seoDescription: null, images: [] }),
  ];
  for (const code of all) {
    assert.ok(ISSUE_LABELS[code], code);
    assert.ok(ISSUE_FIXES[code], code);
  }
});

test("issue summary truncates to max labels", () => {
  assert.deepEqual(
    summarizeIssues(["META_DESC_MISSING", "NO_IMAGES", "DESCRIPTION_WEAK"]),
    { labels: ["Missing meta description", "No product images"], more: 1 },
  );
  assert.deepEqual(summarizeIssues([]), { labels: [], more: 0 });
});
