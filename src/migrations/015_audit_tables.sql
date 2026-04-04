-- Migration 015: Add notification_attempts and payment_webhooks tables

-- ─── notification_attempts ────────────────────────────────────────────────────
-- One row per external notification sent (email, whatsapp, sms)
-- Lets us answer "did the recipient ever receive this gift notification?"
CREATE TABLE IF NOT EXISTS notification_attempts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_sent_id    UUID NOT NULL REFERENCES gifts_sent(id),
  channel         VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
  recipient       VARCHAR(255) NOT NULL,  -- email address or phone number
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sent', 'failed')),
  provider        VARCHAR(50),            -- 'zoho', 'verifyway', etc.
  provider_ref    VARCHAR(255),           -- provider's message/delivery ID
  error_message   TEXT,
  attempted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_attempts_gift ON notification_attempts(gift_sent_id);

-- ─── payment_webhooks ─────────────────────────────────────────────────────────
-- Raw log of every incoming Tap webhook
-- Lets us detect duplicate webhooks, replay failures, audit disputes
CREATE TABLE IF NOT EXISTS payment_webhooks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        VARCHAR(50) NOT NULL DEFAULT 'tap',
  charge_id       VARCHAR(255),
  status          VARCHAR(50),
  raw_payload     JSONB NOT NULL,
  processed       BOOLEAN NOT NULL DEFAULT FALSE,
  error_message   TEXT,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_webhooks_charge ON payment_webhooks(charge_id);
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_processed ON payment_webhooks(processed);
