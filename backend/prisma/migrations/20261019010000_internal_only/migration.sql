-- Keep legacy role enum values for historical inactive staff, but allow only two active roles.
BEGIN;
ALTER TABLE "companies" ADD COLUMN "isInternal" BOOLEAN NOT NULL DEFAULT false;
INSERT INTO "companies" ("id","name","type","isInternal","isActive","paymentTermsDays","creditLimit","createdAt","updatedAt")
VALUES ('dd597ed2-fad1-5482-ab82-8f2bb84d8852','SCMU','SHIPPER',true,true,30,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET "name"='SCMU',"type"='SHIPPER',"isInternal"=true,"isActive"=true,"creditLimit"=0,"updatedAt"=CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX "companies_single_internal" ON "companies" ("isInternal") WHERE "isInternal"=true;
UPDATE "companies" SET "email"=COALESCE("email",'info@scmu.local'),"city"=COALESCE("city",'Merauke'),"state"=COALESCE("state",'Papua Selatan'),"address"='Alamat internal SCMU, Merauke' WHERE "isInternal";

-- Preserve every business transaction under SCMU, without retaining customer master records.
UPDATE "rfqs" SET "shipperCompanyId"='dd597ed2-fad1-5482-ab82-8f2bb84d8852';
UPDATE "shipments" SET "shipperCompanyId"='dd597ed2-fad1-5482-ab82-8f2bb84d8852';
UPDATE "invoices" SET "companyId"='dd597ed2-fad1-5482-ab82-8f2bb84d8852';
UPDATE "sales_quotations" SET "customerId"='dd597ed2-fad1-5482-ab82-8f2bb84d8852';
UPDATE "job_orders" SET "customerId"='dd597ed2-fad1-5482-ab82-8f2bb84d8852';

-- Reassign historical customer actions to the responsible internal account before deleting logins.
CREATE TEMP TABLE "scmu_removed_customer_users" AS SELECT "id" FROM "users" WHERE "role"='CUSTOMER';
CREATE TEMP TABLE "scmu_internal_actor" AS SELECT "id" FROM "users" WHERE "role" IN ('SUPER_ADMIN','ADMIN') ORDER BY CASE WHEN "role"='SUPER_ADMIN' THEN 0 ELSE 1 END,"createdAt" LIMIT 1;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "scmu_removed_customer_users") AND NOT EXISTS (SELECT 1 FROM "scmu_internal_actor") THEN
    RAISE EXCEPTION 'An internal administrator is required before removing customer accounts';
  END IF;
END $$;
UPDATE "rfqs" SET "createdById"=(SELECT "id" FROM "scmu_internal_actor") WHERE "createdById" IN (SELECT "id" FROM "scmu_removed_customer_users");
UPDATE "shipments" SET "createdById"=(SELECT "id" FROM "scmu_internal_actor") WHERE "createdById" IN (SELECT "id" FROM "scmu_removed_customer_users");
UPDATE "quotes" SET "submittedById"=(SELECT "id" FROM "scmu_internal_actor") WHERE "submittedById" IN (SELECT "id" FROM "scmu_removed_customer_users");
UPDATE "sales_quotations" SET "createdById"=(SELECT "id" FROM "scmu_internal_actor") WHERE "createdById" IN (SELECT "id" FROM "scmu_removed_customer_users");
UPDATE "job_orders" SET "createdById"=(SELECT "id" FROM "scmu_internal_actor") WHERE "createdById" IN (SELECT "id" FROM "scmu_removed_customer_users");
UPDATE "activity_logs" SET "userId"=(SELECT "id" FROM "scmu_internal_actor"),"metadata"=COALESCE("metadata",'{}'::jsonb) || '{"formerActor":"Removed customer account"}'::jsonb WHERE "userId" IN (SELECT "id" FROM "scmu_removed_customer_users");
UPDATE "job_charges" SET "createdById"=(SELECT "id" FROM "scmu_internal_actor") WHERE "createdById" IN (SELECT "id" FROM "scmu_removed_customer_users");
UPDATE "job_payments" SET "createdById"=(SELECT "id" FROM "scmu_internal_actor") WHERE "createdById" IN (SELECT "id" FROM "scmu_removed_customer_users");
UPDATE "job_operations" SET "createdById"=(SELECT "id" FROM "scmu_internal_actor") WHERE "createdById" IN (SELECT "id" FROM "scmu_removed_customer_users");
UPDATE "job_documents" SET "uploadedById"=NULL WHERE "uploadedById" IN (SELECT "id" FROM "scmu_removed_customer_users");
UPDATE "job_documents" SET "verifiedById"=NULL WHERE "verifiedById" IN (SELECT "id" FROM "scmu_removed_customer_users");
UPDATE "job_charges" SET "approvedById"=NULL WHERE "approvedById" IN (SELECT "id" FROM "scmu_removed_customer_users");
DELETE FROM "users" WHERE "role"='CUSTOMER';
UPDATE "users" SET "isActive"=false,"updatedAt"=CURRENT_TIMESTAMP WHERE "role" NOT IN ('SUPER_ADMIN','ADMIN');
UPDATE "users" SET "companyId"='dd597ed2-fad1-5482-ab82-8f2bb84d8852' WHERE "role" IN ('SUPER_ADMIN','ADMIN');
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'ADMIN';
ALTER TABLE "users" ADD CONSTRAINT "users_internal_active_roles" CHECK (NOT "isActive" OR "role" IN ('SUPER_ADMIN','ADMIN'));
ALTER TABLE "users" ADD CONSTRAINT "users_no_customer_accounts" CHECK ("role" <> 'CUSTOMER');

-- Companies that also have vendor history remain vendor records, without customer functionality.
UPDATE "companies" c SET "type"='TRANSPORTER',"creditLimit"=0 WHERE NOT c."isInternal" AND
  (c."type"='BOTH' OR (c."type"='SHIPPER' AND (
    EXISTS (SELECT 1 FROM "quotes" q WHERE q."transporterId"=c."id") OR
    EXISTS (SELECT 1 FROM "job_charges" j WHERE j."vendorId"=c."id") OR
    EXISTS (SELECT 1 FROM "shipments" s WHERE s."carrierId"=c."id"))));
UPDATE "users" SET "companyId"=NULL WHERE "companyId" IN (SELECT "id" FROM "companies" WHERE "type"='SHIPPER' AND NOT "isInternal");
UPDATE "vehicles" SET "companyId"='dd597ed2-fad1-5482-ab82-8f2bb84d8852' WHERE "companyId" IN (SELECT "id" FROM "companies" WHERE "type"='SHIPPER' AND NOT "isInternal");
UPDATE "drivers" SET "companyId"='dd597ed2-fad1-5482-ab82-8f2bb84d8852' WHERE "companyId" IN (SELECT "id" FROM "companies" WHERE "type"='SHIPPER' AND NOT "isInternal");
DELETE FROM "companies" WHERE "type"='SHIPPER' AND NOT "isInternal";
ALTER TABLE "companies" ADD CONSTRAINT "companies_internal_or_partner" CHECK (("isInternal" AND "type"='SHIPPER') OR (NOT "isInternal" AND "type" IN ('TRANSPORTER','BROKER','CONSIGNEE')));
UPDATE "job_documents" SET "customerVisible"=false;
DROP TABLE "scmu_removed_customer_users";
DROP TABLE "scmu_internal_actor";
COMMIT;
