-- Internal disbursements settle an approved cost, just like vendor payments,
-- while receivables continue to require an invoice.
ALTER TABLE "job_payments" DROP CONSTRAINT "job_payment_target_check";
ALTER TABLE "job_payments" ADD CONSTRAINT "job_payment_target_check" CHECK (
  ("direction" = 'RECEIVABLE' AND "invoiceId" IS NOT NULL AND "chargeId" IS NULL) OR
  ("direction" IN ('PAYABLE', 'INTERNAL_EXPENSE') AND "chargeId" IS NOT NULL AND "invoiceId" IS NULL)
);
ALTER TABLE "job_payments" ADD CONSTRAINT "internal_payment_recipient" CHECK (
  "direction" <> 'INTERNAL_EXPENSE' OR ("paidTo" IS NOT NULL AND LENGTH(TRIM("paidTo")) > 0)
);
CREATE INDEX "job_charges_shipmentId_idx" ON "job_charges"("shipmentId");
