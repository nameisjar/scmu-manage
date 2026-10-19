ALTER TYPE "SalesQuotationStatus" ADD VALUE 'APPROVED';
CREATE TYPE "DirectorDecision" AS ENUM ('SUBMITTED', 'APPROVED', 'RETURNED', 'REJECTED', 'WITHDRAWN');
CREATE TABLE "director_approvals" (
  "id" TEXT NOT NULL, "action" TEXT NOT NULL, "entityId" TEXT NOT NULL, "jobId" TEXT,
  "scopeKey" TEXT NOT NULL, "status" "DirectorDecision" NOT NULL DEFAULT 'SUBMITTED',
  "payload" JSONB NOT NULL, "snapshot" JSONB NOT NULL, "fingerprint" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL, "reviewedById" TEXT, "requestNote" TEXT, "reviewNote" TEXT,
  "reviewedAt" TIMESTAMP(3), "executedAt" TIMESTAMP(3), "resultId" TEXT,
  "withdrawnById" TEXT, "withdrawnAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "director_approvals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "director_approvals_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "director_approvals_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "director_approvals_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "director_approvals_jobId_status_idx" ON "director_approvals"("jobId", "status");
CREATE INDEX "director_approvals_status_createdAt_idx" ON "director_approvals"("status", "createdAt");
CREATE UNIQUE INDEX "director_approvals_open_scope_key" ON "director_approvals"("scopeKey") WHERE "status" IN ('SUBMITTED','APPROVED') AND "executedAt" IS NULL;
-- Historical final documents and posted financial transactions remain unchanged.
