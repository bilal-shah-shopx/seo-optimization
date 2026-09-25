import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { AuditInput } from "./audit";

export const PRODUCTS_PAGE_SIZE = 25;
const MEDIA_LIMIT = 20;

const PRODUCT_FIELDS = `#graphql
  fragment SeoProductFields on Product {
    id
    title
    handle
    status
    description
    onlineStoreUrl
    seo {
      title
      description
    }
    media(first: ${MEDIA_LIMIT}) {
      nodes {
        id
        mediaContentType
        alt
        ... on MediaImage {
          image {
            url
          }
        }
      }
    }
  }
`;

const PRODUCTS_QUERY = `#graphql
  ${PRODUCT_FIELDS}
  query SeoProducts($first: Int!, $after: String) {
    products(first: $first, after: $after, query: "status:active", sortKey: ID) {
      nodes {
        ...SeoProductFields
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const PRODUCT_QUERY = `#graphql
  ${PRODUCT_FIELDS}
  query SeoProduct($id: ID!) {
    product(id: $id) {
      ...SeoProductFields
    }
  }
`;

const PRODUCT_SEO_UPDATE = `#graphql
  mutation SeoProductUpdate($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const FILE_ALT_UPDATE = `#graphql
  mutation SeoFileAltUpdate($files: [FileUpdateInput!]!) {
    fileUpdate(files: $files) {
      files {
        id
        alt
      }
      userErrors {
        field
        message
      }
    }
  }
`;

interface RawProduct {
  id: string;
  title: string;
  handle: string;
  status: string;
  description: string;
  onlineStoreUrl: string | null;
  seo: { title: string | null; description: string | null };
  media: {
    nodes: {
      id: string;
      mediaContentType: string;
      alt: string | null;
      image?: { url: string } | null;
    }[];
  };
}

export interface SeoImage {
  id: string;
  alt: string | null;
  url: string;
}

export interface SeoProduct extends AuditInput {
  id: string;
  handle: string;
  status: string;
  onlineStoreUrl: string | null;
  images: SeoImage[];
}

export interface UserError {
  field: string[] | null;
  message: string;
}

interface GraphqlResponse<T> {
  data?: T;
  errors?: unknown;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isThrottled(error: unknown): boolean {
  return /throttl/i.test(JSON.stringify(error ?? "") + String(error));
}

async function request<T>(
  admin: AdminApiContext,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await admin.graphql(query, { variables });
      const json = (await response.json()) as GraphqlResponse<T>;
      if (json.errors) throw json.errors;
      return json.data as T;
    } catch (error) {
      if (attempt === 0 && isThrottled(error)) {
        await sleep(2000);
        continue;
      }
      throw error;
    }
  }
}

function toSeoProduct(raw: RawProduct): SeoProduct {
  return {
    id: raw.id,
    title: raw.title,
    handle: raw.handle,
    status: raw.status,
    description: raw.description ?? "",
    onlineStoreUrl: raw.onlineStoreUrl,
    seoTitle: raw.seo?.title ?? null,
    seoDescription: raw.seo?.description ?? null,
    images: raw.media.nodes
      .filter((node) => node.mediaContentType === "IMAGE" && node.image)
      .map((node) => ({ id: node.id, alt: node.alt, url: node.image!.url })),
  };
}

export async function fetchProductsPage(
  admin: AdminApiContext,
  after: string | null,
) {
  const data = await request<{
    products: {
      nodes: RawProduct[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  }>(admin, PRODUCTS_QUERY, { first: PRODUCTS_PAGE_SIZE, after });

  return {
    products: data.products.nodes.map(toSeoProduct),
    pageInfo: data.products.pageInfo,
  };
}

export async function fetchProduct(
  admin: AdminApiContext,
  id: string,
): Promise<SeoProduct | null> {
  const data = await request<{ product: RawProduct | null }>(
    admin,
    PRODUCT_QUERY,
    { id },
  );
  return data.product ? toSeoProduct(data.product) : null;
}

export async function updateProductSeo(
  admin: AdminApiContext,
  id: string,
  seo: { title: string; description: string },
): Promise<UserError[]> {
  const data = await request<{
    productUpdate: { userErrors: UserError[] };
  }>(admin, PRODUCT_SEO_UPDATE, { product: { id, seo } });
  return data.productUpdate.userErrors;
}

export async function updateImageAlts(
  admin: AdminApiContext,
  files: { id: string; alt: string }[],
): Promise<UserError[]> {
  const data = await request<{ fileUpdate: { userErrors: UserError[] } }>(
    admin,
    FILE_ALT_UPDATE,
    { files },
  );
  return data.fileUpdate.userErrors;
}

export const productGid = (numericId: string) =>
  `gid://shopify/Product/${numericId}`;

export const numericId = (gid: string) => gid.split("/").pop() ?? gid;
