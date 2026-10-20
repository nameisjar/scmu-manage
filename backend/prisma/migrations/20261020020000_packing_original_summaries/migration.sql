-- Preserve all existing declared values. Missing values on new originals are
-- NULL, distinct from an explicitly declared zero. Outgoing totals remain
-- calculated from item rows by the application.
ALTER TABLE "packing_lists"
  ALTER COLUMN "netWeightKg" DROP NOT NULL,
  ALTER COLUMN "netWeightKg" DROP DEFAULT,
  ALTER COLUMN "grossWeightKg" DROP NOT NULL,
  ALTER COLUMN "grossWeightKg" DROP DEFAULT,
  ALTER COLUMN "volumeCbm" DROP NOT NULL,
  ALTER COLUMN "volumeCbm" DROP DEFAULT,
  ADD COLUMN "summaryCheckedAt" TIMESTAMP(3),
  ADD COLUMN "summaryCheckedById" TEXT;

ALTER TABLE "sea_bill_cargo"
  ALTER COLUMN "grossWeightKg" DROP NOT NULL,
  ALTER COLUMN "volumeCbm" DROP NOT NULL;
