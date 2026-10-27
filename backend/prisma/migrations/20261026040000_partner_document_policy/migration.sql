ALTER TABLE "companies"
  ADD COLUMN "documentPolicy" TEXT NOT NULL DEFAULT 'BL_ONLY',
  ADD COLUMN "includeInPackingHeader" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "companies"
  ADD CONSTRAINT "companies_document_policy_check"
  CHECK ("documentPolicy" IN ('BL_ONLY','BL_AND_PACKING'));
