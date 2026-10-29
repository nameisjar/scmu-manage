BEGIN;
CREATE TABLE "shipping_journeys" (
 "id" TEXT PRIMARY KEY, "number" TEXT NOT NULL UNIQUE, "activeKey" TEXT UNIQUE,
 "vesselId" TEXT, "voyageId" TEXT, "vesselName" TEXT, "voyageNumber" TEXT, "period" TEXT,
 "destination" TEXT, "departureDate" TIMESTAMP(3), "arrivalDate" TIMESTAMP(3), "notes" TEXT,
 "data" JSONB NOT NULL DEFAULT '{}', "version" INTEGER NOT NULL DEFAULT 1,
 "archivedAt" TIMESTAMP(3), "deletedAt" TIMESTAMP(3), "createdById" TEXT, "sharedJobId" TEXT UNIQUE,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "shipping_journeys_sharedJobId_fkey" FOREIGN KEY ("sharedJobId") REFERENCES "job_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "shipping_journeys_vesselId_voyageId_idx" ON "shipping_journeys"("vesselId","voyageId");
CREATE INDEX "shipping_journeys_deletedAt_archivedAt_idx" ON "shipping_journeys"("deletedAt","archivedAt");
CREATE TABLE "journey_files" (
 "id" TEXT PRIMARY KEY, "journeyId" TEXT NOT NULL, "category" TEXT NOT NULL, "filename" TEXT NOT NULL,
 "originalName" TEXT NOT NULL, "mimeType" TEXT NOT NULL, "size" INTEGER NOT NULL, "note" TEXT, "uploadedById" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "journey_files_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "shipping_journeys"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "journey_files_journeyId_createdAt_idx" ON "journey_files"("journeyId","createdAt");
ALTER TABLE "sea_bills" ADD COLUMN "journeyId" TEXT;
ALTER TABLE "sea_bills" ADD CONSTRAINT "sea_bills_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "shipping_journeys"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "sea_bills_journeyId_idx" ON "sea_bills"("journeyId");

-- Keep every B/L, job, file and transaction in place. Only add their parent.
-- Unknown vessel/voyage/destination and historical trash stay separate.
CREATE TEMP TABLE journey_backfill ON COMMIT DROP AS
WITH base AS (
 SELECT b.*, COALESCE(v."name",b."vesselName") AS ship,
 COALESCE(vo."period",EXTRACT(YEAR FROM COALESCE(b."issueDate",b."onBoardDate",b."createdAt"))::text) AS yr,
 vo."period" IS NOT NULL AS confirmed,
 COALESCE(b."registerData"->'trash'->>'deletedAt','') <> '' AS removed,
 regexp_replace(upper(regexp_replace(COALESCE(v."name",b."vesselName",''),'^(KM|K\.M\.|MV|M\.V\.)[ .]+','','i')),'[^A-Z0-9]','','g') AS shipkey,
 regexp_replace(upper(regexp_replace(COALESCE(b."voyageNumber",''),'^(VOYAGE|VOY|V)[ .:]+','','i')),'[^A-Z0-9]','','g') AS voykey,
 regexp_replace(upper(COALESCE(b."portOfDischarge",'')),'[^A-Z0-9]','','g') AS destkey
 FROM "sea_bills" b LEFT JOIN "vessels" v ON v.id=b."vesselId" LEFT JOIN "voyages" vo ON vo.id=b."voyageId"
)
SELECT *, CASE WHEN removed THEN 'trash:'||id WHEN shipkey='' OR voykey='' OR destkey='' THEN 'legacy:'||id
 ELSE shipkey||'|'||voykey||'|'||yr||'|'||destkey END AS parentkey FROM base;

INSERT INTO "shipping_journeys" (id,"number","activeKey","vesselId","voyageId","vesselName","voyageNumber","period","destination","data","archivedAt","deletedAt","createdAt","updatedAt")
SELECT md5('scmu-journey:'||parentkey),'PGR-'||upper(substr(md5(parentkey),1,20)),
 CASE WHEN bool_or(removed) OR parentkey LIKE 'legacy:%' THEN NULL ELSE parentkey END,
 min("vesselId"),min("voyageId"),min(ship),min("voyageNumber"),min(yr),min("portOfDischarge"),
 jsonb_build_object('backfilled',true,'periodConfirmed',bool_and(confirmed),'trash',CASE WHEN bool_or(removed) THEN jsonb_build_object('reason','Data lama di Sampah','billIds',jsonb_agg(id)) ELSE NULL END),
 CASE WHEN bool_and("archivedAt" IS NOT NULL) THEN max("archivedAt") ELSE NULL END,
 CASE WHEN bool_or(removed) THEN max(NULLIF("registerData"->'trash'->>'deletedAt','')::timestamptz) ELSE NULL END,
 min("createdAt"),CURRENT_TIMESTAMP FROM journey_backfill GROUP BY parentkey;
UPDATE "sea_bills" b SET "journeyId"=md5('scmu-journey:'||f.parentkey) FROM journey_backfill f WHERE f.id=b.id;
COMMIT;
