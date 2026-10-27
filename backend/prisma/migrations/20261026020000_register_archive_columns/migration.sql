-- Reversible archive metadata; no rows are deleted or rewritten.
ALTER TABLE "sea_bills" ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archivedById" TEXT;
