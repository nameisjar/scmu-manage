-- Additive only: keep all historical register/job/document identities and values.
ALTER TABLE "sea_bills" ADD COLUMN "registerAmount" DECIMAL(18,2);
