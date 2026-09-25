import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import prisma from "../../db.server";
import { auditProduct, type AuditResult } from "./audit";
import { fetchProduct, type SeoProduct } from "./queries.server";

export async function saveAudit(
  shop: string,
  product: SeoProduct,
  scannedAt: Date = new Date(),
): Promise<AuditResult> {
  const audit = auditProduct(product);
  const data = {
    title: product.title,
    handle: product.handle,
    imageUrl: product.images[0]?.url ?? null,
    score: audit.score,
    issueCount: audit.issues.length,
    issues: JSON.stringify(audit.issues),
    scannedAt,
  };
  await prisma.productAudit.upsert({
    where: { shop_productId: { shop, productId: product.id } },
    create: { shop, productId: product.id, ...data },
    update: data,
  });
  return audit;
}

// Fetches one product live and refreshes its stored audit. Non-active products are removed.
export async function syncProduct(
  admin: AdminApiContext,
  shop: string,
  productId: string,
) {
  const product = await fetchProduct(admin, productId);
  if (!product || product.status !== "ACTIVE") {
    await prisma.productAudit.deleteMany({ where: { shop, productId } });
    return product ? { product, audit: auditProduct(product) } : null;
  }
  const audit = await saveAudit(shop, product);
  return { product, audit };
}
