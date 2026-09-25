import { META_DESC_MAX, SEO_TITLE_MAX } from "../lib/seo/audit";

const truncate = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

export function SearchPreview({
  url,
  productTitle,
  productDescription,
  seoTitle,
  seoDescription,
}: {
  url: string;
  productTitle: string;
  productDescription: string;
  seoTitle: string;
  seoDescription: string;
}) {
  const usingDefaultTitle = !seoTitle.trim();
  const usingDefaultDescription = !seoDescription.trim();
  const title = usingDefaultTitle ? productTitle : seoTitle.trim();
  const description = usingDefaultDescription
    ? productDescription.trim()
    : seoDescription.trim();

  return (
    <s-stack gap="small-200">
      <s-box padding="base" borderWidth="base" borderRadius="base">
        <s-stack gap="small-300">
          <s-text color="subdued">{url}</s-text>
          <span style={{ color: "#1a0dab", fontSize: 18, lineHeight: 1.3 }}>
            {truncate(title, SEO_TITLE_MAX)}
          </span>
          <span style={{ color: "#4d5156", fontSize: 14, lineHeight: 1.5 }}>
            {description
              ? truncate(description, META_DESC_MAX)
              : "No description available."}
          </span>
        </s-stack>
      </s-box>
      {usingDefaultTitle && (
        <s-text color="subdued">
          Using product title (Shopify default) because no SEO title is set.
        </s-text>
      )}
      {usingDefaultDescription && (
        <s-text color="subdued">
          Using product description excerpt (Shopify default) because no meta
          description is set.
        </s-text>
      )}
    </s-stack>
  );
}
