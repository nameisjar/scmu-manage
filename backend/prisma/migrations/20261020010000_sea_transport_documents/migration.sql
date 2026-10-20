-- CreateTable
CREATE TABLE "sea_bills" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentKind" TEXT NOT NULL DEFAULT 'BILL_OF_LADING',
    "billNumber" TEXT,
    "issueDate" TIMESTAMP(3),
    "carrierName" TEXT,
    "vesselName" TEXT,
    "voyageNumber" TEXT,
    "portOfLoading" TEXT,
    "portOfDischarge" TEXT,
    "shipperName" TEXT,
    "consigneeName" TEXT,
    "containers" JSONB NOT NULL DEFAULT '[]',
    "packages" INTEGER NOT NULL DEFAULT 0,
    "grossWeightKg" DECIMAL(16,3) NOT NULL DEFAULT 0,
    "volumeCbm" DECIMAL(16,4) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "reviewIssues" TEXT,
    "internalStatus" TEXT NOT NULL DEFAULT 'SEA_UNCHECKED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "contentVersion" INTEGER NOT NULL DEFAULT 1,
    "reviewedContentVersion" INTEGER,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewChecks" JSONB,
    "approvedSnapshot" JSONB,
    "releaseStatus" TEXT NOT NULL DEFAULT 'SEA_RELEASE_PENDING',
    "releaseMethod" TEXT,
    "releaseReference" TEXT,
    "releaseNote" TEXT,
    "releaseProofId" TEXT,
    "releasedAt" TIMESTAMP(3),
    "releasedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sea_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sea_bill_cargo" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "packingListId" TEXT NOT NULL,
    "packages" INTEGER NOT NULL,
    "grossWeightKg" DECIMAL(16,3) NOT NULL,
    "volumeCbm" DECIMAL(16,4) NOT NULL,
    "scope" TEXT,
    "declaredSnapshot" JSONB NOT NULL,

    CONSTRAINT "sea_bill_cargo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sea_bill_files" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "contentVersion" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "externalNumber" TEXT,
    "documentDate" TIMESTAMP(3),
    "note" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sea_bill_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sea_bill_revisions" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sea_bill_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sea_bills_documentId_key" ON "sea_bills"("documentId");

-- CreateIndex
CREATE INDEX "sea_bills_jobId_shipmentId_idx" ON "sea_bills"("jobId", "shipmentId");

-- CreateIndex
CREATE INDEX "sea_bill_cargo_packingListId_idx" ON "sea_bill_cargo"("packingListId");

-- CreateIndex
CREATE UNIQUE INDEX "sea_bill_cargo_billId_packingListId_key" ON "sea_bill_cargo"("billId", "packingListId");

-- CreateIndex
CREATE INDEX "sea_bill_files_billId_createdAt_idx" ON "sea_bill_files"("billId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "sea_bill_revisions_billId_version_key" ON "sea_bill_revisions"("billId", "version");

-- AddForeignKey
ALTER TABLE "sea_bills" ADD CONSTRAINT "sea_bills_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sea_bills" ADD CONSTRAINT "sea_bills_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sea_bills" ADD CONSTRAINT "sea_bills_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "job_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sea_bill_cargo" ADD CONSTRAINT "sea_bill_cargo_billId_fkey" FOREIGN KEY ("billId") REFERENCES "sea_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sea_bill_cargo" ADD CONSTRAINT "sea_bill_cargo_packingListId_fkey" FOREIGN KEY ("packingListId") REFERENCES "packing_lists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sea_bill_files" ADD CONSTRAINT "sea_bill_files_billId_fkey" FOREIGN KEY ("billId") REFERENCES "sea_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sea_bill_revisions" ADD CONSTRAINT "sea_bill_revisions_billId_fkey" FOREIGN KEY ("billId") REFERENCES "sea_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Retain every existing file and document. Backfill only its structured sea
-- record; historical attachments are not assumed to be final/released BLs.
INSERT INTO "job_documents" ("id","jobId","shipmentId","type","title","required","customerVisible","status","createdAt","updatedAt")
SELECT md5('sea-document-' || s."id"),s."jobId",s."id",'BILL_OF_LADING','BL / Sea waybill - ' || s."shipmentNumber",true,false,'PENDING',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM "shipments" s JOIN "job_orders" j ON j."id"=s."jobId"
WHERE s."mode"='SEA' AND s."status"<>'CANCELLED' AND j."status" NOT IN ('CLOSED','CANCELLED')
AND NOT EXISTS (SELECT 1 FROM "job_documents" d WHERE d."shipmentId"=s."id" AND d."type" IN ('BILL_OF_LADING','SEA_WAYBILL'));

INSERT INTO "sea_bills" ("id","jobId","shipmentId","documentId","documentKind","carrierName","vesselName","createdAt","updatedAt")
SELECT md5('sea-bill-' || d."id"),d."jobId",s."id",d."id",d."type",c."name",s."vesselFlight",d."createdAt",CURRENT_TIMESTAMP
FROM "job_documents" d JOIN "shipments" s ON s."id"=d."shipmentId" AND s."jobId"=d."jobId" LEFT JOIN "companies" c ON c."id"=s."carrierId"
WHERE s."mode"='SEA' AND d."type" IN ('BILL_OF_LADING','SEA_WAYBILL');

INSERT INTO "sea_bill_files" ("id","billId","category","contentVersion","filename","originalName","mimeType","size","uploadedById","note","createdAt")
SELECT md5('sea-file-' || d."id"),b."id",'LEGACY',1,d."filename",COALESCE(d."originalName",d."filename"),COALESCE(d."mimeType",'application/pdf'),COALESCE(d."size",0),d."uploadedById",'Existing attachment preserved; confirm its document stage before uploading a final revision.',d."updatedAt"
FROM "sea_bills" b JOIN "job_documents" d ON d."id"=b."documentId" WHERE d."filename" IS NOT NULL;

INSERT INTO "sea_bill_revisions" ("id","billId","version","action","snapshot","note")
SELECT md5('sea-history-' || b."id"),b."id",1,'SEA_BILL_MIGRATED',jsonb_build_object('documentKind',b."documentKind",'carrierName',b."carrierName",'vesselName',b."vesselName",'internalStatus',b."internalStatus",'releaseStatus',b."releaseStatus",'allocations','[]'::jsonb),'Existing sea checklist and attachments retained without changing the original records.' FROM "sea_bills" b;

ALTER TABLE "sea_bill_cargo" ADD CONSTRAINT "sea_cargo_nonnegative" CHECK ("packages">0 AND "grossWeightKg">=0 AND "volumeCbm">=0);
ALTER TABLE "sea_bills" ADD CONSTRAINT "sea_bill_nonnegative" CHECK ("packages">=0 AND "grossWeightKg">=0 AND "volumeCbm">=0);
