import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { data, useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { ScoreBadge } from "../components/ScoreBadge";
import { SearchPreview } from "../components/SearchPreview";
import {
  auditProduct,
  DESCRIPTION_MIN,
  ISSUE_FIXES,
  ISSUE_LABELS,
  META_DESC_MAX,
  SEO_TITLE_MAX,
  type Issue,
  type IssueCode,
} from "../lib/seo/audit";
import {
  numericId,
  productGid,
  updateImageAlts,
  updateProductSeo,
  type UserError,
} from "../lib/seo/queries.server";
import { syncProduct } from "../lib/seo/sync.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const result = await syncProduct(admin, session.shop, productGid(params.id!));
  if (!result) throw new Response("Product not found", { status: 404 });

  const { product, audit } = result;
  return {
    product,
    audit,
    adminUrl: `shopify://admin/products/${numericId(product.id)}`,
    previewUrl:
      product.onlineStoreUrl ??
      `https://${session.shop}/products/${product.handle}`,
  };
};

interface FieldErrors {
  seoTitle?: string;
  seoDescription?: string;
  alts?: Record<string, string>;
  general?: string[];
}

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const id = productGid(params.id!);
  const form = await request.formData();
  const errors: FieldErrors = {};

  if (form.get("seoChanged") === "1") {
    const userErrors = await updateProductSeo(admin, id, {
      title: String(form.get("seoTitle") ?? "").trim(),
      description: String(form.get("seoDescription") ?? "").trim(),
    });
    for (const error of userErrors) {
      const field = error.field?.join(".") ?? "";
      if (field.includes("title")) errors.seoTitle = error.message;
      else if (field.includes("description"))
        errors.seoDescription = error.message;
      else (errors.general ??= []).push(error.message);
    }
  }

  const alts = JSON.parse(String(form.get("alts") ?? "[]")) as {
    id: string;
    alt: string;
  }[];
  if (alts.length > 0) {
    const userErrors: UserError[] = await updateImageAlts(
      admin,
      alts.map((image) => ({ id: image.id, alt: image.alt.trim() })),
    );
    for (const error of userErrors) {
      const index = Number(error.field?.[1]);
      const image = alts[index];
      if (image) (errors.alts ??= {})[image.id] = error.message;
      else (errors.general ??= []).push(error.message);
    }
  }

  await syncProduct(admin, session.shop, id);

  const hasErrors =
    errors.seoTitle ||
    errors.seoDescription ||
    errors.alts ||
    errors.general?.length;
  return hasErrors
    ? data({ ok: false as const, errors }, { status: 422 })
    : { ok: true as const, errors };
};

const countLabel = (length: number, max: number) =>
  `${length}/${max} characters${length > max ? " — too long" : ""}`;

const FIELD_TARGETS: Record<IssueCode, { id: string; label: string }> = {
  SEO_TITLE_NOT_CUSTOMIZED: { id: "seo-title", label: "SEO title" },
  SEO_TITLE_TOO_LONG: { id: "seo-title", label: "SEO title" },
  META_DESC_MISSING: { id: "meta-description", label: "Meta description" },
  META_DESC_TOO_LONG: { id: "meta-description", label: "Meta description" },
  DESCRIPTION_WEAK: { id: "product-description", label: "Product description" },
  IMAGE_ALT_MISSING: { id: "images", label: "Images" },
  NO_IMAGES: { id: "images", label: "Images" },
};

function targetId(issue: Issue) {
  const firstImage = issue.imageIds?.[0];
  return issue.code === "IMAGE_ALT_MISSING" && firstImage
    ? `alt-${firstImage}`
    : FIELD_TARGETS[issue.code].id;
}

function goToField(id: string) {
  const element = document.getElementById(id);
  element?.scrollIntoView({ behavior: "smooth", block: "center" });
  element?.focus({ preventScroll: true });
}

function IssueCard({ issue }: { issue: Issue }) {
  return (
    <s-box padding="base" borderWidth="base" borderRadius="base">
      <s-stack gap="small-200">
        <s-stack
          direction="inline"
          gap="small"
          alignItems="center"
          justifyContent="space-between"
        >
          <s-text type="strong">{ISSUE_LABELS[issue.code]}</s-text>
          <s-badge tone={issue.deduction >= 20 ? "critical" : "warning"}>
            −{issue.deduction} points
          </s-badge>
        </s-stack>
        <s-text>{issue.message}</s-text>
        <s-text color="subdued">Fix: {ISSUE_FIXES[issue.code]}</s-text>
        <s-stack direction="inline">
          <s-button
            variant="tertiary"
            onClick={() => goToField(targetId(issue))}
          >
            Go to {FIELD_TARGETS[issue.code].label.toLowerCase()}
          </s-button>
        </s-stack>
      </s-stack>
    </s-box>
  );
}

export default function ProductDetail() {
  const { product, audit, adminUrl, previewUrl } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [seoTitle, setSeoTitle] = useState(product.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(
    product.seoDescription ?? "",
  );
  const [alts, setAlts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      product.images.map((image) => [image.id, image.alt ?? ""]),
    ),
  );

  // Reset the form to the freshly revalidated product after a successful save.
  const handled = useRef<typeof fetcher.data>();
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (handled.current === fetcher.data) return;
    handled.current = fetcher.data;
    if (fetcher.data.ok) {
      setSeoTitle(product.seoTitle ?? "");
      setSeoDescription(product.seoDescription ?? "");
      setAlts(
        Object.fromEntries(
          product.images.map((image) => [image.id, image.alt ?? ""]),
        ),
      );
      shopify.toast.show("SEO updated");
    } else {
      shopify.toast.show("Some changes could not be saved", { isError: true });
    }
  }, [fetcher.state, fetcher.data, product, shopify]);

  const seoChanged =
    seoTitle !== (product.seoTitle ?? "") ||
    seoDescription !== (product.seoDescription ?? "");
  const changedAlts = product.images
    .filter((image) => alts[image.id] !== (image.alt ?? ""))
    .map((image) => ({ id: image.id, alt: alts[image.id] }));
  const dirty = seoChanged || changedAlts.length > 0;
  const saving = fetcher.state !== "idle";

  const preview = useMemo(
    () =>
      auditProduct({
        ...product,
        seoTitle,
        seoDescription,
        images: product.images.map((image) => ({
          id: image.id,
          alt: alts[image.id],
        })),
      }),
    [product, seoTitle, seoDescription, alts],
  );
  const shown = dirty ? preview : audit;
  const issueFor = (...codes: IssueCode[]) =>
    shown.issues.find((issue) => codes.includes(issue.code));
  const withIssue = (details: string, issue?: Issue) =>
    issue ? `${ISSUE_LABELS[issue.code]} · ${details}` : details;
  const titleIssue = issueFor("SEO_TITLE_NOT_CUSTOMIZED", "SEO_TITLE_TOO_LONG");
  const metaIssue = issueFor("META_DESC_MISSING", "META_DESC_TOO_LONG");
  const missingAltIds = new Set(issueFor("IMAGE_ALT_MISSING")?.imageIds ?? []);
  const errors = fetcher.data?.errors ?? {};

  const save = () =>
    fetcher.submit(
      {
        seoChanged: seoChanged ? "1" : "0",
        seoTitle,
        seoDescription,
        alts: JSON.stringify(changedAlts),
      },
      { method: "POST" },
    );

  const descriptionLength = product.description.trim().length;

  return (
    <s-page heading={product.title}>
      <s-link slot="breadcrumb-actions" href="/app/products">
        Products
      </s-link>
      <s-button
        slot="primary-action"
        variant="primary"
        disabled={!dirty || saving}
        onClick={save}
        {...(saving ? { loading: true } : {})}
      >
        Save
      </s-button>
      <s-button
        slot="secondary-actions"
        // App Bridge routes shopify://admin URLs to the native admin page.
        onClick={() => open(adminUrl, "_top")}
      >
        Edit in Shopify
      </s-button>

      {product.status !== "ACTIVE" && (
        <s-banner tone="info">
          This product is not active, so it is excluded from scans.
        </s-banner>
      )}
      {errors.general?.map((message) => (
        <s-banner key={message} tone="critical">
          {message}
        </s-banner>
      ))}

      <s-section heading="SEO score">
        <s-stack gap="base">
          <s-stack direction="inline" gap="small" alignItems="center">
            <ScoreBadge score={shown.score} issueCount={shown.issues.length} />
            {dirty && (
              <s-text color="subdued">Preview — unsaved changes</s-text>
            )}
          </s-stack>
          {shown.issues.length === 0 ? (
            <s-paragraph>No issues detected.</s-paragraph>
          ) : (
            <s-stack gap="small">
              {shown.issues.map((issue) => (
                <IssueCard key={issue.code} issue={issue} />
              ))}
            </s-stack>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Search engine listing">
        <s-stack gap="base">
          <s-text-field
            id="seo-title"
            label="SEO title"
            value={seoTitle}
            placeholder={product.title}
            details={withIssue(
              countLabel(seoTitle.trim().length, SEO_TITLE_MAX),
              titleIssue,
            )}
            error={errors.seoTitle}
            onInput={(event) => setSeoTitle(event.currentTarget.value)}
          />
          <s-text-area
            id="meta-description"
            label="Meta description"
            value={seoDescription}
            rows={3}
            details={withIssue(
              countLabel(seoDescription.trim().length, META_DESC_MAX),
              metaIssue,
            )}
            error={errors.seoDescription}
            onInput={(event) => setSeoDescription(event.currentTarget.value)}
          />
          <SearchPreview
            url={previewUrl}
            productTitle={product.title}
            productDescription={product.description}
            seoTitle={seoTitle}
            seoDescription={seoDescription}
          />
        </s-stack>
      </s-section>

      <s-section id="product-description" heading="Product description">
        <s-paragraph>
          {descriptionLength === 0
            ? "Missing."
            : `${descriptionLength} characters`}
          {descriptionLength < DESCRIPTION_MIN
            ? ` Aim for at least ${DESCRIPTION_MIN} characters. Edit the description in Shopify.`
            : " Looks good."}
        </s-paragraph>
      </s-section>

      <s-section id="images" heading="Images">
        {product.images.length === 0 ? (
          <s-paragraph>
            This product has no images. Add images in Shopify.
          </s-paragraph>
        ) : (
          <s-grid
            gridTemplateColumns="repeat(auto-fill, minmax(200px, 1fr))"
            gap="base"
          >
            {product.images.map((image, index) => (
              <s-stack key={image.id} gap="small">
                <s-image
                  src={image.url}
                  alt={alts[image.id] || `Image ${index + 1}`}
                  aspectRatio="1/1"
                  objectFit="contain"
                  borderRadius="base"
                />
                <s-text-field
                  id={`alt-${image.id}`}
                  label={`Alt text for image ${index + 1}`}
                  value={alts[image.id]}
                  error={
                    errors.alts?.[image.id] ??
                    (missingAltIds.has(image.id)
                      ? "Missing alt text"
                      : undefined)
                  }
                  onInput={(event) => {
                    const value = event.currentTarget.value;
                    setAlts((current) => ({ ...current, [image.id]: value }));
                  }}
                />
              </s-stack>
            ))}
          </s-grid>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
