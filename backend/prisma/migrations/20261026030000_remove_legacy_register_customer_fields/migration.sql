-- Customer master/portal fields are no longer part of the internal SCMU register.
-- Remove only the two deprecated JSON properties; keep the register row and all
-- transport/document/audit relationships intact.
UPDATE sea_bills
SET "registerData" = jsonb_set(
  "registerData",
  '{register}',
  COALESCE("registerData"->'register', '{}'::jsonb) - 'customerName' - 'billingPartyName',
  true
)
WHERE COALESCE("registerData"->'register', '{}'::jsonb) ?| ARRAY['customerName', 'billingPartyName'];
