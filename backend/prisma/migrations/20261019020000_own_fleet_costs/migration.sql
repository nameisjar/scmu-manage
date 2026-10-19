CREATE TYPE "TransportSource" AS ENUM ('INTERNAL', 'EXTERNAL');
CREATE TYPE "CostSource" AS ENUM ('INTERNAL', 'VENDOR');
CREATE TYPE "CostCategory" AS ENUM ('FUEL', 'TOLL', 'PARKING', 'DRIVER_ALLOWANCE', 'LOADING_UNLOADING', 'FREIGHT', 'OTHER');
ALTER TYPE "PaymentDirection" ADD VALUE 'INTERNAL_EXPENSE';

ALTER TABLE "shipments" ADD COLUMN "transportSource" "TransportSource" NOT NULL DEFAULT 'EXTERNAL';
-- Preserve historical vendor assignments and monetary records. Unassigned legacy road
-- legs are classified as internal only when they have no externally owned resources.
UPDATE "shipments" s SET "transportSource" = 'INTERNAL'
WHERE s."mode" = 'ROAD' AND s."carrierId" IS NULL AND s."quoteId" IS NULL
AND NOT EXISTS (SELECT 1 FROM "vehicles" v LEFT JOIN "companies" c ON c.id = v."companyId" WHERE v.id = s."vehicleId" AND COALESCE(c."isInternal", false) = false)
AND NOT EXISTS (SELECT 1 FROM "drivers" d LEFT JOIN "companies" c ON c.id = d."companyId" WHERE d.id = s."driverId" AND COALESCE(c."isInternal", false) = false);

ALTER TABLE "job_charges" ADD COLUMN "costSource" "CostSource" NOT NULL DEFAULT 'VENDOR',
ADD COLUMN "costCategory" "CostCategory" NOT NULL DEFAULT 'OTHER', ADD COLUMN "shipmentId" TEXT;
ALTER TABLE "job_charges" ADD CONSTRAINT "job_charges_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "job_charges" ADD CONSTRAINT "internal_cost_no_vendor" CHECK ("kind" <> 'COST' OR "costSource" <> 'INTERNAL' OR "vendorId" IS NULL);
ALTER TABLE "shipments" ADD CONSTRAINT "internal_transport_no_vendor" CHECK ("transportSource" <> 'INTERNAL' OR ("carrierId" IS NULL AND "mode" = 'ROAD' AND "quoteId" IS NULL));
ALTER TABLE "job_payments" ADD COLUMN "paidTo" TEXT, ADD COLUMN "notes" TEXT;
