import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { AppLink } from "../components/AppLink";
import { ScoreBadge } from "../components/ScoreBadge";
import { IssueSummary } from "../components/IssueSummary";
import { parseIssues } from "../lib/seo/audit";
import { numericId } from "../lib/seo/queries.server";

const PAGE_SIZE = 25;
const FILTERS = [
  { value: "all", label: "All" },
  { value: "issues", label: "Has issues" },
  { value: "good", label: "Good" },
] as const;
type Filter = (typeof FILTERS)[number]["value"];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const filterParam = url.searchParams.get("filter");
  const filter: Filter = FILTERS.some((f) => f.value === filterParam)
    ? (filterParam as Filter)
    : "all";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);

  const where = {
    shop: session.shop,
    ...(filter === "issues" && { issueCount: { gt: 0 } }),
    ...(filter === "good" && { issueCount: 0 }),
  };

  const [total, audits, scanned] = await Promise.all([
    prisma.productAudit.count({ where }),
    prisma.productAudit.findMany({
      where,
      orderBy: [{ score: "asc" }, { title: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.shopScan.findUnique({ where: { shop: session.shop } }),
  ]);

  return {
    filter,
    page,
    hasNextPage: page * PAGE_SIZE < total,
    total,
    everScanned: Boolean(scanned),
    products: audits.map((audit) => ({
      id: numericId(audit.productId),
      title: audit.title,
      imageUrl: audit.imageUrl,
      score: audit.score,
      issueCount: audit.issueCount,
      issueCodes: parseIssues(audit.issues).map((issue) => issue.code),
    })),
  };
};

export default function Products() {
  const { filter, page, hasNextPage, total, everScanned, products } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const go = (nextFilter: Filter, nextPage: number) =>
    navigate(`/app/products?filter=${nextFilter}&page=${nextPage}`);

  return (
    <s-page heading="Products">
      <s-section padding="none">
        <s-box padding="base">
          <s-stack direction="inline" gap="small" alignItems="center">
            {FILTERS.map((f) => (
              <s-button
                key={f.value}
                variant={f.value === filter ? "primary" : "secondary"}
                onClick={() => go(f.value, 1)}
              >
                {f.label}
              </s-button>
            ))}
            <s-text color="subdued">{total} products</s-text>
          </s-stack>
        </s-box>

        {products.length === 0 ? (
          <s-box padding="base">
            <s-paragraph>
              {everScanned ? (
                "No products match this filter."
              ) : (
                <>
                  No scan results yet.{" "}
                  <AppLink to="/app">Go to the dashboard</AppLink> and run a
                  scan.
                </>
              )}
            </s-paragraph>
          </s-box>
        ) : (
          <s-table
            paginate
            hasPreviousPage={page > 1}
            hasNextPage={hasNextPage}
            onPreviousPage={() => go(filter, page - 1)}
            onNextPage={() => go(filter, page + 1)}
          >
            <s-table-header-row>
              <s-table-header listSlot="primary">Product</s-table-header>
              <s-table-header>Score</s-table-header>
              <s-table-header>Issues</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {products.map((product) => (
                <s-table-row key={product.id}>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small" alignItems="center">
                      <s-thumbnail
                        src={product.imageUrl ?? undefined}
                        alt={product.title}
                        size="small"
                      />
                      <AppLink to={`/app/products/${product.id}`}>
                        {product.title}
                      </AppLink>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>
                    <ScoreBadge
                      score={product.score}
                      issueCount={product.issueCount}
                    />
                  </s-table-cell>
                  <s-table-cell>
                    <IssueSummary codes={product.issueCodes} />
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
