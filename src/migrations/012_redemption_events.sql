-- Redemption events: one row per redemption action (partial or full)
CREATE TABLE IF NOT EXISTS redemption_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_instance_id UUID NOT NULL REFERENCES gift_instances(id),
  merchant_id     UUID REFERENCES merchants(id),
  amount          DECIMAL(10, 2),
  currency_code   VARCHAR(3),
  balance_after   DECIMAL(10, 2),
  notes           TEXT,
  redeemed_at     TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_redemption_events_instance ON redemption_events(gift_instance_id);
CREATE INDEX IF NOT EXISTS idx_redemption_events_merchant ON redemption_events(merchant_id);
