ALTER TABLE "rfqs" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'IDR';
UPDATE "rfqs" SET "currency" = 'INR';
