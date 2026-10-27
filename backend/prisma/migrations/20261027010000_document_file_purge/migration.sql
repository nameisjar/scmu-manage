CREATE TABLE "document_file_purges" (
    "filename" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    CONSTRAINT "document_file_purges_pkey" PRIMARY KEY ("filename")
);
