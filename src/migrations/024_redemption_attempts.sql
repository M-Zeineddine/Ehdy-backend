-- Failed redemption attempts — confirmRedemption throws before writing anything
-- to gift_instances/redemption_events, so failures were previously invisible.
-- merchant_id/merchant_user_id/branch_id come from the authenticated request,
-- not from the (possibly invalid/foreign) code, so they're always known even
-- when the code itself doesn't resolve to anything.
CREATE TABLE IF NOT EXISTS redemption_attempts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id      UUID REFERENCES merchants(id),
  merchant_user_id UUID REFERENCES merchant_users(id),
  branch_id        UUID REFERENCES merchant_branches(id),
  attempted_code   VARCHAR(255),
  error_code       VARCHAR(50) NOT NULL,
  error_message    TEXT,
  attempted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_redemption_attempts_merchant     ON redemption_attempts(merchant_id);
CREATE INDEX IF NOT EXISTS idx_redemption_attempts_attempted_at ON redemption_attempts(attempted_at);
