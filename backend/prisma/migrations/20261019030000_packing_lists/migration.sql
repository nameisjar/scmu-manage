CREATE TYPE "PackingDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "PackingStatus" AS ENUM ('DRAFT', 'FINAL');
CREATE TYPE "ReceiptStatus" AS ENUM ('PENDING', 'RECEIVED', 'DISCREPANCY');
CREATE TABLE "packing_lists" (
 "id" TEXT NOT NULL, "jobId" TEXT NOT NULL, "documentId" TEXT NOT NULL,
 "direction" "PackingDirection" NOT NULL, "status" "PackingStatus" NOT NULL DEFAULT 'DRAFT',
 "recordNumber" TEXT NOT NULL, "externalNumber" TEXT, "documentDate" TIMESTAMP(3) NOT NULL,
 "senderName" TEXT NOT NULL, "senderAddress" TEXT, "recipientName" TEXT NOT NULL, "recipientAddress" TEXT,
 "originCity" TEXT NOT NULL, "destCity" TEXT NOT NULL, "reference" TEXT, "notes" TEXT,
 "companyName" TEXT NOT NULL, "companyAddress" TEXT, "companyPhone" TEXT, "companyEmail" TEXT,
 "packages" INTEGER NOT NULL DEFAULT 0, "netWeightKg" DECIMAL(16,3) NOT NULL DEFAULT 0,
 "grossWeightKg" DECIMAL(16,3) NOT NULL DEFAULT 0, "volumeCbm" DECIMAL(16,4) NOT NULL DEFAULT 0,
 "receiptStatus" "ReceiptStatus", "receivedAt" TIMESTAMP(3), "receivedBy" TEXT, "actualPackages" INTEGER,
 "actualWeightKg" DECIMAL(16,3), "actualVolumeCbm" DECIMAL(16,4), "discrepancyNotes" TEXT,
 "version" INTEGER NOT NULL DEFAULT 1, "createdById" TEXT NOT NULL, "finalizedById" TEXT, "finalizedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "packing_lists_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "packing_totals_valid" CHECK ("packages" >= 0 AND "netWeightKg" >= 0 AND "grossWeightKg" >= "netWeightKg" AND "volumeCbm" >= 0 AND ("actualPackages" IS NULL OR "actualPackages" >= 0) AND ("actualWeightKg" IS NULL OR "actualWeightKg" >= 0) AND ("actualVolumeCbm" IS NULL OR "actualVolumeCbm" >= 0)),
 CONSTRAINT "packing_direction_shape" CHECK (("direction" = 'INBOUND' AND "externalNumber" IS NOT NULL AND "receiptStatus" IS NOT NULL) OR ("direction" = 'OUTBOUND' AND "externalNumber" IS NULL AND "receiptStatus" IS NULL)),
 CONSTRAINT "packing_lists_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "packing_lists_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "job_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "packing_lists_documentId_key" ON "packing_lists"("documentId");
CREATE UNIQUE INDEX "packing_lists_recordNumber_key" ON "packing_lists"("recordNumber");
CREATE UNIQUE INDEX "packing_lists_jobId_direction_senderName_externalNumber_key" ON "packing_lists"("jobId", "direction", "senderName", "externalNumber");
CREATE INDEX "packing_lists_jobId_direction_status_idx" ON "packing_lists"("jobId", "direction", "status");
CREATE TABLE "packing_list_items" (
 "id" TEXT NOT NULL, "packingListId" TEXT NOT NULL, "sequence" INTEGER NOT NULL,
 "description" TEXT NOT NULL, "marks" TEXT, "quantity" DECIMAL(16,4) NOT NULL, "unit" TEXT NOT NULL,
 "packages" INTEGER NOT NULL, "netWeightKg" DECIMAL(16,3) NOT NULL, "grossWeightKg" DECIMAL(16,3) NOT NULL,
 "lengthCm" DECIMAL(12,3), "widthCm" DECIMAL(12,3), "heightCm" DECIMAL(12,3), "volumeCbm" DECIMAL(16,4) NOT NULL,
 CONSTRAINT "packing_list_items_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "packing_item_values_valid" CHECK ("quantity" > 0 AND "packages" > 0 AND "netWeightKg" >= 0 AND "grossWeightKg" >= "netWeightKg" AND "volumeCbm" >= 0),
 CONSTRAINT "packing_list_items_packingListId_fkey" FOREIGN KEY ("packingListId") REFERENCES "packing_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "packing_list_items_packingListId_sequence_key" ON "packing_list_items"("packingListId", "sequence");
CREATE TABLE "packing_list_sources" (
 "packingListId" TEXT NOT NULL, "sourceId" TEXT NOT NULL,
 CONSTRAINT "packing_list_sources_pkey" PRIMARY KEY ("packingListId", "sourceId"),
 CONSTRAINT "packing_list_sources_packingListId_fkey" FOREIGN KEY ("packingListId") REFERENCES "packing_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "packing_list_sources_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "packing_lists"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "packing_source_not_self" CHECK ("packingListId" <> "sourceId")
);
