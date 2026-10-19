-- CreateEnum
CREATE TYPE "TransportMode" AS ENUM ('ROAD', 'SEA', 'AIR', 'RAIL');

-- CreateEnum
CREATE TYPE "SalesQuotationStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('BOOKED', 'IN_PROGRESS', 'DELIVERED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ChargeKind" AS ENUM ('REVENUE', 'COST');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'UPLOADED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "PaymentDirection" AS ENUM ('RECEIVABLE', 'PAYABLE');

-- CreateEnum
CREATE TYPE "OperationKind" AS ENUM ('WAREHOUSE', 'CUSTOMS', 'CLAIM', 'INSURANCE');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'CUSTOMER';

-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_shipmentId_fkey";

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "creditLimit" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "npwp" TEXT,
ADD COLUMN     "paymentTermsDays" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "quotes" ALTER COLUMN "currency" SET DEFAULT 'IDR';

-- AlterTable
ALTER TABLE "shipments" ADD COLUMN     "bookingNumber" TEXT,
ADD COLUMN     "carrierId" TEXT,
ADD COLUMN     "containerNumber" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'IDR',
ADD COLUMN     "emptyReturnedAt" TIMESTAMP(3),
ADD COLUMN     "freeUntil" TIMESTAMP(3),
ADD COLUMN     "jobId" TEXT,
ADD COLUMN     "mode" "TransportMode" NOT NULL DEFAULT 'ROAD',
ADD COLUMN     "sealNumber" TEXT,
ADD COLUMN     "sequence" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "vesselFlight" TEXT;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "jobId" TEXT,
ALTER COLUMN "shipmentId" DROP NOT NULL,
ALTER COLUMN "currency" SET DEFAULT 'IDR';

-- CreateTable
CREATE TABLE "sales_quotations" (
    "id" TEXT NOT NULL,
    "quotationNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "originCity" TEXT NOT NULL,
    "destCity" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL DEFAULT 'DOMESTIC',
    "cargoDescription" TEXT NOT NULL,
    "packages" INTEGER NOT NULL DEFAULT 1,
    "weightKg" DECIMAL(16,3) NOT NULL DEFAULT 0,
    "volumeCbm" DECIMAL(16,4) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "validUntil" TIMESTAMP(3) NOT NULL,
    "plannedPickup" TIMESTAMP(3),
    "expectedDelivery" TIMESTAMP(3),
    "terms" TEXT,
    "status" "SalesQuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_quotation_items" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(16,4) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'JOB',
    "sellRate" DECIMAL(18,2) NOT NULL,
    "buyRate" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "sales_quotation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_orders" (
    "id" TEXT NOT NULL,
    "jobNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "quotationId" TEXT,
    "customerReference" TEXT,
    "serviceType" TEXT NOT NULL DEFAULT 'DOMESTIC',
    "originCity" TEXT NOT NULL,
    "destCity" TEXT NOT NULL,
    "cargoDescription" TEXT NOT NULL,
    "packages" INTEGER NOT NULL DEFAULT 1,
    "weightKg" DECIMAL(16,3) NOT NULL DEFAULT 0,
    "volumeCbm" DECIMAL(16,4) NOT NULL DEFAULT 0,
    "recipientName" TEXT,
    "deliveryAddress" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "plannedPickup" TIMESTAMP(3),
    "expectedDelivery" TIMESTAMP(3),
    "notes" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'BOOKED',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_charges" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "kind" "ChargeKind" NOT NULL,
    "description" TEXT NOT NULL,
    "estimatedAmount" DECIMAL(18,2) NOT NULL,
    "actualAmount" DECIMAL(18,2),
    "vendorId" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PROPOSED',
    "dueDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_documents" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "shipmentId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "customerVisible" BOOLEAN NOT NULL DEFAULT true,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "filename" TEXT,
    "originalName" TEXT,
    "mimeType" TEXT,
    "size" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "uploadedById" TEXT,
    "verifiedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "chargeId" TEXT,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_payments" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "direction" "PaymentDirection" NOT NULL,
    "invoiceId" TEXT,
    "chargeId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "reference" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'BANK_TRANSFER',
    "isAdvance" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_operations" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "kind" "OperationKind" NOT NULL,
    "status" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "location" TEXT,
    "party" TEXT,
    "quantity" INTEGER,
    "amount" DECIMAL(18,2),
    "eventDate" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_quotations_quotationNumber_key" ON "sales_quotations"("quotationNumber");

-- CreateIndex
CREATE INDEX "sales_quotations_customerId_status_idx" ON "sales_quotations"("customerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "job_orders_jobNumber_key" ON "job_orders"("jobNumber");

-- CreateIndex
CREATE UNIQUE INDEX "job_orders_quotationId_key" ON "job_orders"("quotationId");

-- CreateIndex
CREATE INDEX "job_orders_customerId_status_idx" ON "job_orders"("customerId", "status");

-- CreateIndex
CREATE INDEX "job_charges_jobId_kind_status_idx" ON "job_charges"("jobId", "kind", "status");

-- CreateIndex
CREATE INDEX "job_documents_jobId_status_idx" ON "job_documents"("jobId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_items_chargeId_key" ON "invoice_items"("chargeId");

-- CreateIndex
CREATE UNIQUE INDEX "job_payments_jobId_reference_direction_key" ON "job_payments"("jobId", "reference", "direction");

-- CreateIndex
CREATE INDEX "job_operations_jobId_kind_idx" ON "job_operations"("jobId", "kind");

-- CreateIndex
CREATE INDEX "shipments_jobId_sequence_idx" ON "shipments"("jobId", "sequence");

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_quotations" ADD CONSTRAINT "sales_quotations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_quotations" ADD CONSTRAINT "sales_quotations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_quotation_items" ADD CONSTRAINT "sales_quotation_items_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "sales_quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_orders" ADD CONSTRAINT "job_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_orders" ADD CONSTRAINT "job_orders_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "sales_quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_orders" ADD CONSTRAINT "job_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_charges" ADD CONSTRAINT "job_charges_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_charges" ADD CONSTRAINT "job_charges_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_documents" ADD CONSTRAINT "job_documents_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_documents" ADD CONSTRAINT "job_documents_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "job_charges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_payments" ADD CONSTRAINT "job_payments_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_payments" ADD CONSTRAINT "job_payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_payments" ADD CONSTRAINT "job_payments_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "job_charges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_operations" ADD CONSTRAINT "job_operations_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Historical shipments were priced in INR; keep their amounts in that currency.
UPDATE "shipments" SET "currency" = 'INR';

ALTER TABLE "job_payments" ADD CONSTRAINT "job_payment_target_check" CHECK (
  ("direction" = 'RECEIVABLE' AND "invoiceId" IS NOT NULL AND "chargeId" IS NULL) OR
  ("direction" = 'PAYABLE' AND "chargeId" IS NOT NULL AND "invoiceId" IS NULL)
);
ALTER TABLE "job_payments" ADD CONSTRAINT "job_payment_positive" CHECK ("amount" > 0);
ALTER TABLE "job_charges" ADD CONSTRAINT "job_charge_nonnegative" CHECK ("estimatedAmount" >= 0 AND ("actualAmount" IS NULL OR "actualAmount" >= 0));
