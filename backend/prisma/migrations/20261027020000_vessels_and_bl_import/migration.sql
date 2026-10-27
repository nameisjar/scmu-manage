CREATE TABLE "vessels" (
  "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "normalizedName" TEXT NOT NULL,
  "carrierName" TEXT, "imoNumber" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "vessels_normalizedName_key" ON "vessels"("normalizedName");
CREATE TABLE "vessel_aliases" ("key" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "vesselId" TEXT NOT NULL REFERENCES "vessels"("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE INDEX "vessel_aliases_vesselId_idx" ON "vessel_aliases"("vesselId");
CREATE TABLE "voyages" (
  "id" TEXT PRIMARY KEY, "vesselId" TEXT NOT NULL REFERENCES "vessels"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "number" TEXT NOT NULL, "normalizedNumber" TEXT NOT NULL, "period" TEXT NOT NULL,
  "portOfLoading" TEXT, "portOfDischarge" TEXT, "departureDate" TIMESTAMP(3), "arrivalDate" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true, "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "voyages_vesselId_normalizedNumber_period_key" ON "voyages"("vesselId","normalizedNumber","period");
CREATE INDEX "voyages_vesselId_idx" ON "voyages"("vesselId");
CREATE TABLE "bl_import_sessions" (
  "id" TEXT PRIMARY KEY, "filename" TEXT NOT NULL, "originalName" TEXT NOT NULL, "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL, "hash" TEXT NOT NULL, "createdById" TEXT NOT NULL, "extracted" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "bl_import_sessions_filename_key" ON "bl_import_sessions"("filename");
CREATE INDEX "bl_import_sessions_expiresAt_idx" ON "bl_import_sessions"("expiresAt");
ALTER TABLE "sea_bills" ADD COLUMN "vesselId" TEXT REFERENCES "vessels"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD COLUMN "voyageId" TEXT REFERENCES "voyages"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD COLUMN "notifyPartyName" TEXT, ADD COLUMN "onBoardDate" TIMESTAMP(3);
CREATE INDEX "sea_bills_vesselId_voyageId_idx" ON "sea_bills"("vesselId","voyageId");
-- Preserve all historical document strings. Only link normalized vessel identities;
-- a voyage period cannot be inferred from a record's creation timestamp.
WITH names AS (
  SELECT "vesselName" AS name, "carrierName" AS carrier,
    regexp_replace(regexp_replace(upper(trim("vesselName")), '^(KM|K\.M\.|MV|M\.V\.)[[:space:].]+', ''), '[^A-Z0-9]', '', 'g') AS key
  FROM "sea_bills" WHERE "vesselName" IS NOT NULL AND trim("vesselName") <> ''
), grouped AS (
  SELECT key, min(name) AS name, CASE WHEN count(DISTINCT carrier)=1 THEN min(carrier) ELSE NULL END AS carrier FROM names WHERE key<>'' GROUP BY key
)
INSERT INTO "vessels"("id","name","normalizedName","carrierName","updatedAt") SELECT md5('scmu-vessel:'||key),name,key,carrier,CURRENT_TIMESTAMP FROM grouped;
INSERT INTO "vessel_aliases"("key","name","vesselId") SELECT "normalizedName","name","id" FROM "vessels";
UPDATE "sea_bills" AS b SET "vesselId"=v.id FROM "vessels" AS v WHERE v."normalizedName"=
  regexp_replace(regexp_replace(upper(trim(b."vesselName")), '^(KM|K\.M\.|MV|M\.V\.)[[:space:].]+', ''), '[^A-Z0-9]', '', 'g');
