CREATE TYPE "JobType" AS ENUM ('SENDER', 'RECEIVER');
ALTER TABLE "job_orders" ADD COLUMN "jobType" "JobType" NOT NULL DEFAULT 'SENDER';
-- Infer receiving jobs from existing original documents, keeping every transaction intact.
UPDATE "job_orders" j SET "jobType" = 'RECEIVER'
WHERE EXISTS (SELECT 1 FROM "packing_lists" p WHERE p."jobId" = j.id AND p.direction = 'INBOUND')
AND NOT EXISTS (SELECT 1 FROM "packing_lists" p WHERE p."jobId" = j.id AND p.direction = 'OUTBOUND');

CREATE TABLE "packing_headers" (
  "id" TEXT NOT NULL, "jobId" TEXT NOT NULL, "headerNumber" TEXT NOT NULL,
  "documentDate" TIMESTAMP(3) NOT NULL, "originCity" TEXT NOT NULL, "destCity" TEXT NOT NULL,
  "reference" TEXT, "notes" TEXT, "companyName" TEXT NOT NULL, "companyAddress" TEXT,
  "companyPhone" TEXT, "companyEmail" TEXT, "status" "PackingStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1, "createdById" TEXT NOT NULL, "finalizedById" TEXT,
  "finalizedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "packing_headers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "packing_headers_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "packing_headers_jobId_key" ON "packing_headers"("jobId");
CREATE UNIQUE INDEX "packing_headers_headerNumber_key" ON "packing_headers"("headerNumber");
ALTER TABLE "packing_lists" ADD COLUMN "headerId" TEXT;
ALTER TABLE "packing_lists" ADD CONSTRAINT "packing_lists_headerId_fkey" FOREIGN KEY ("headerId") REFERENCES "packing_headers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "packing_lists" ADD CONSTRAINT "packing_header_inbound_only" CHECK ("headerId" IS NULL OR "direction" = 'INBOUND');
CREATE INDEX "packing_lists_headerId_idx" ON "packing_lists"("headerId");
-- Existing incoming rows remain original documents; give each receiving job its own group.
INSERT INTO "packing_headers" ("id", "jobId", "headerNumber", "documentDate", "originCity", "destCity", "companyName", "companyAddress", "companyPhone", "companyEmail", "status", "createdById", "finalizedById", "finalizedAt", "createdAt", "updatedAt")
SELECT 'migrated-header-' || j.id, j.id, 'KPL-MIG-' || j."jobNumber", MIN(p."documentDate"), j."originCity", j."destCity",
  MIN(p."companyName"), MIN(p."companyAddress"), MIN(p."companyPhone"), MIN(p."companyEmail"),
  CASE WHEN bool_and(p.status = 'FINAL') THEN 'FINAL'::"PackingStatus" ELSE 'DRAFT'::"PackingStatus" END,
  j."createdById", CASE WHEN bool_and(p.status = 'FINAL') THEN j."createdById" END,
  CASE WHEN bool_and(p.status = 'FINAL') THEN MAX(p."finalizedAt") END, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "job_orders" j JOIN "packing_lists" p ON p."jobId" = j.id AND p.direction = 'INBOUND'
WHERE j."jobType" = 'RECEIVER' GROUP BY j.id;
UPDATE "packing_lists" p SET "headerId" = h.id FROM "packing_headers" h WHERE p."jobId" = h."jobId" AND p.direction = 'INBOUND';
