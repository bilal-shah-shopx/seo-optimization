import { useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { AppLink } from "../components/AppLink";
import { ScoreBadge } from "../components/ScoreBadge";
import { IssueSummary } from "../components/IssueSummary";
import {
  isScanStale,
  parseIssues,
  STALE_SCAN_DAYS,
  type Issue,
} from "../lib/seo/audit";
import { numericId } from "../lib/seo/queries.server";
import { scanShop } from "../lib/seo/scan.server";

function formatRelative(date: Date, now: Date) {
  const minutes = Math.round((now.getTime() - date.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [scan, audits] = await Promise.all([
    prisma.shopScan.findUnique({ where: { shop } }),
    prisma.productAudit.findMany({
      where: { shop },
      select: {
        productId: true,
        title: true,
        score: true,
        issueCount: true,
        issues: true,
      },
      orderBy: [{ score: "asc" }, { title: "asc" }],
    }),
  ]);

  const has = (issues: Issue[], ...codes: Issue["code"][]) =>
    issues.some((issue) => codes.includes(issue.code));
  const parsed = audits.map((audit) => parseIssues(audit.issues));
  const countWith = (...codes: Issue["code"][]) =>
    parsed.filter((issues) => has(issues, ...codes)).length;

  const now = new Date();
  return {
    lastScanned: scan ? formatRelative(scan.lastScannedAt, now) : null,
    stale: isScanStale(scan?.lastScannedAt, now),
    stats: {
      overallScore: audits.length
        ? Math.round(
            audits.reduce((sum, audit) => sum + audit.score, 0) / audits.length,
          )
        : null,
      scanned: audits.length,
      withIssues: audits.filter((audit) => audit.issueCount > 0).length,
      seoTitleNotCustomized: countWith("SEO_TITLE_NOT_CUSTOMIZED"),
      metaMissing: countWith("META_DESC_MISSING"),
      tooLong: countWith("SEO_TITLE_TOO_LONG", "META_DESC_TOO_LONG"),
      altMissing: countWith("IMAGE_ALT_MISSING"),
    },
    worst: audits
      .map((audit, index) => ({
        id: numericId(audit.productId),
        title: audit.title,
        score: audit.score,
        issueCount: audit.issueCount,
        issueCodes: parsed[index].map((issue) => issue.code),
      }))
      .filter((audit) => audit.issueCount > 0)
      .slice(0, 5),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const scanned = await scanShop(admin, session.shop);
  return { scanned };
};

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <s-box padding="base" borderWidth="base" borderRadius="base">
      <s-stack gap="small-200">
        <s-text color="subdued">{label}</s-text>
        <s-heading>{String(value)}</s-heading>
      </s-stack>
    </s-box>
  );
}

export default function Dashboard() {
  const { lastScanned, stale, stats, worst } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const scanning = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      shopify.toast.show(`Scanned ${fetcher.data.scanned} products`);
    }
  }, [fetcher.state, fetcher.data, shopify]);

  const scan = () => fetcher.submit({}, { method: "POST" });

  return (
    <s-page heading="SEO Dashboard">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={scan}
        {...(scanning ? { loading: true } : {})}
      >
        Scan products
      </s-button>

      {stale && (
        <s-banner tone="warning">
          {lastScanned
            ? `Last scan was more than ${STALE_SCAN_DAYS} days ago. Run a new scan to refresh results.`
            : "No scan yet. Scan your active products to see SEO results."}
        </s-banner>
      )}

      <s-section heading="Overview">
        <s-stack gap="base">
          <s-text color="subdued">
            {lastScanned ? `Last scanned ${lastScanned}` : "Never scanned"}
          </s-text>
          <s-grid
            gridTemplateColumns="repeat(auto-fit, minmax(180px, 1fr))"
            gap="base"
          >
            <Stat label="Overall SEO score" value={stats.overallScore ?? "—"} />
            <Stat label="Products scanned" value={stats.scanned} />
            <Stat label="Products with issues" value={stats.withIssues} />
            <Stat
              label="SEO title not customized"
              value={stats.seoTitleNotCustomized}
            />
            <Stat label="Missing meta description" value={stats.metaMissing} />
            <Stat label="Title/description too long" value={stats.tooLong} />
            <Stat label="Images missing alt text" value={stats.altMissing} />
          </s-grid>
        </s-stack>
      </s-section>

      <s-section heading="Needs attention">
        {worst.length === 0 ? (
          <s-paragraph>
            {stats.scanned
              ? "No products with issues. Nice work!"
              : "Run a scan to find products that need attention."}
          </s-paragraph>
        ) : (
          <s-stack gap="base">
            {worst.map((product) => (
              <s-stack
                key={product.id}
                direction="inline"
                gap="base"
                alignItems="center"
                justifyContent="space-between"
              >
                <s-stack gap="small-300">
                  <AppLink to={`/app/products/${product.id}`}>
                    {product.title}
                  </AppLink>
                  <IssueSummary codes={product.issueCodes} variant="text" />
                </s-stack>
                <s-stack direction="inline" gap="small" alignItems="center">
                  <ScoreBadge
                    score={product.score}
                    issueCount={product.issueCount}
                  />
                </s-stack>
              </s-stack>
            ))}
            <AppLink to="/app/products?filter=issues">
              View all products with issues
            </AppLink>
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
