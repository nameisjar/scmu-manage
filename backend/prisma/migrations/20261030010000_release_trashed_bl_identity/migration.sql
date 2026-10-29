-- A shipment in trash keeps its B/L number, files and history but no longer
-- reserves that number. Active and archived shipments still share the existing
-- unique registerIdentity index. Future trash/restore actions maintain the claim.
UPDATE "sea_bills"
SET "registerIdentity" = NULL
WHERE COALESCE("registerData"->'trash'->>'deletedAt', '') <> ''
  AND "registerIdentity" IS NOT NULL;
