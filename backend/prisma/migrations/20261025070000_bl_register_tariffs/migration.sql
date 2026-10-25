-- Additive only. Existing BL numbers can be duplicated across historical legs;
-- only newly registered identities use the optional unique registerIdentity.
ALTER TABLE "sea_bills" ADD COLUMN "registerNumber" TEXT,
  ADD COLUMN "registerData" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "registerIdentity" TEXT;
CREATE UNIQUE INDEX "sea_bills_registerNumber_key" ON "sea_bills"("registerNumber");
CREATE UNIQUE INDEX "sea_bills_registerIdentity_key" ON "sea_bills"("registerIdentity");
ALTER TABLE "job_charges" ADD COLUMN "tariffKey" TEXT, ADD COLUMN "tariffSnapshot" JSONB;
CREATE UNIQUE INDEX "job_charges_tariffKey_key" ON "job_charges"("tariffKey");
CREATE TABLE "jpt_tariffs" (
 "id" TEXT NOT NULL, "code" TEXT NOT NULL, "description" TEXT NOT NULL,
 "category" TEXT NOT NULL, "size" TEXT, "carrierName" TEXT,
 "unit" TEXT NOT NULL, "unitPrice" DECIMAL(18,2) NOT NULL,
 "currency" TEXT NOT NULL DEFAULT 'IDR', "vatIncluded" BOOLEAN NOT NULL DEFAULT false,
 "vatRate" TEXT, "enabled" BOOLEAN NOT NULL DEFAULT true,
 "confirmationRequired" BOOLEAN NOT NULL DEFAULT false,
 "effectiveFrom" TIMESTAMP(3), "effectiveTo" TIMESTAMP(3), "notes" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "jpt_tariffs_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "jpt_tariffs_nonnegative" CHECK ("unitPrice" >= 0),
 CONSTRAINT "jpt_tariffs_confirmation" CHECK (NOT "confirmationRequired" OR NOT "enabled")
);
CREATE UNIQUE INDEX "jpt_tariffs_code_key" ON "jpt_tariffs"("code");
INSERT INTO "jpt_tariffs" ("id","code","description","category","size","carrierName","unit","unitPrice","vatIncluded","vatRate","enabled","confirmationRequired","notes","updatedAt") VALUES
 ('jpt-ref-dooring-20','DOORING-20','Dooring 20','DOORING','20',NULL,'CONTAINER',3750000,true,'1.1',true,false,'VAT included 1.1%; confirm package inclusions explicitly.',CURRENT_TIMESTAMP),
 ('jpt-ref-dooring-21','DOORING-21','Dooring 21','DOORING','21',NULL,'CONTAINER',3850000,true,'1.1',true,false,'VAT included 1.1%; size 21 is distinct.',CURRENT_TIMESTAMP),
 ('jpt-ref-dooring-40','DOORING-40','Dooring 40','DOORING','40',NULL,'CONTAINER',6750000,true,'1.1',true,false,'VAT included 1.1%; confirm package inclusions explicitly.',CURRENT_TIMESTAMP),
 ('jpt-ref-unconfirmed-20','UNCONFIRMED-20','Unconfirmed second group 20','UNCONFIRMED','20',NULL,'CONTAINER',3485000,false,NULL,false,true,'Reference only: description and inclusion unconfirmed. Never auto-select.',CURRENT_TIMESTAMP),
 ('jpt-ref-unconfirmed-21','UNCONFIRMED-21','Unconfirmed second group 21','UNCONFIRMED','21',NULL,'CONTAINER',3485000,false,NULL,false,true,'Reference only: description and inclusion unconfirmed. Never auto-select.',CURRENT_TIMESTAMP),
 ('jpt-ref-unconfirmed-40','UNCONFIRMED-40','Unconfirmed second group 40','UNCONFIRMED','40',NULL,'CONTAINER',5256000,false,NULL,false,true,'Reference only: description and inclusion unconfirmed. Never auto-select.',CURRENT_TIMESTAMP),
 ('jpt-ref-forklift-20','FORKLIFT-20','Forklift 20','FORKLIFT','20',NULL,'CONTAINER',249750,false,NULL,true,false,'VAT treatment not supplied; no tax added automatically. No size 21 fallback.',CURRENT_TIMESTAMP),
 ('jpt-ref-forklift-40','FORKLIFT-40','Forklift 40','FORKLIFT','40',NULL,'CONTAINER',379620,false,NULL,true,false,'VAT treatment not supplied; no tax added automatically.',CURRENT_TIMESTAMP),
 ('jpt-ref-do-spil','DO-SPIL','Delivery order SPIL','DELIVERY_ORDER',NULL,'SPIL','BL',200000,false,NULL,true,false,'Per BL, not per container. VAT treatment not supplied.',CURRENT_TIMESTAMP),
 ('jpt-ref-do-tanto','DO-TANTO','Delivery order Tanto','DELIVERY_ORDER',NULL,'Tanto','BL',200000,false,NULL,true,false,'Per BL, not per container. VAT treatment not supplied.',CURRENT_TIMESTAMP),
 ('jpt-ref-do-temas','DO-TEMAS','Delivery order Temas','DELIVERY_ORDER',NULL,'Temas','BL',150000,false,NULL,true,false,'Per BL, not per container. VAT treatment not supplied.',CURRENT_TIMESTAMP),
 ('jpt-ref-toeslag','TOESLAG','Toeslag','TOESLAG',NULL,NULL,'CONTAINER',185000,false,NULL,true,false,'Confirm package inclusions to avoid double charging. VAT treatment not supplied.',CURRENT_TIMESTAMP),
 ('jpt-ref-cleaning-20','CLEANING-20','Cleaning 20','CLEANING','20',NULL,'CONTAINER',200000,false,NULL,true,false,'VAT treatment not supplied. No size 21 fallback.',CURRENT_TIMESTAMP),
 ('jpt-ref-cleaning-40','CLEANING-40','Cleaning 40','CLEANING','40',NULL,'CONTAINER',350000,false,NULL,true,false,'VAT treatment not supplied.',CURRENT_TIMESTAMP)
 ON CONFLICT ("code") DO NOTHING;
-- PPh23 2% is informational only and intentionally is not a charge tariff.
