import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import prisma from "../../db.server";
import { fetchProductsPage } from "./queries.server";
import { saveAudit } from "./sync.server";

export async function scanShop(admin: AdminApiContext, shop: string) {
  const scanStartedAt = new Date();
  let after: string | null = null;
  let count = 0;

  do {
    const page = await fetchProductsPage(admin, after);
    for (const product of page.products) {
      await saveAudit(shop, product, scanStartedAt);
    }
    count += page.products.length;
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);

  // Anything not touched by this scan was deleted, archived or drafted.
  await prisma.productAudit.deleteMany({
    where: { shop, scannedAt: { lt: scanStartedAt } },
  });
  await prisma.shopScan.upsert({
    where: { shop },
    create: { shop, lastScannedAt: scanStartedAt, productCount: count },
    update: { lastScannedAt: scanStartedAt, productCount: count },
  });

  return count;
}
