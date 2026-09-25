-- CreateTable
CREATE TABLE "ProductAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "imageUrl" TEXT,
    "score" INTEGER NOT NULL,
    "issueCount" INTEGER NOT NULL,
    "issues" TEXT NOT NULL,
    "scannedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ShopScan" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "lastScannedAt" DATETIME NOT NULL,
    "productCount" INTEGER NOT NULL
);

-- CreateIndex
CREATE INDEX "ProductAudit_shop_score_idx" ON "ProductAudit"("shop", "score");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAudit_shop_productId_key" ON "ProductAudit"("shop", "productId");
