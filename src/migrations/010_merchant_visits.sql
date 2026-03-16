-- Migration 010: merchant visit tracking
--
-- Two tables with different purposes:
--
-- 1. merchant_visits — append-only event log.
--    Every page open appends one row. Used exclusively for analytics
--    (total visits, unique visitors, daily breakdown). Never queried per-user.
--
-- 2. user_merchant_last_visit — one row per (user_id, merchant_id), upserted.
--    Bounded size: at most users × distinct_merchants_visited rows.
--    Used exclusively for the "Recently Viewed" read path.
--    Query is a single index scan — stays fast regardless of how large
--    merchant_visits grows.

-- ── Event log (analytics) ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS merchant_visits (
  id          BIGSERIAL PRIMARY KEY,
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  visited_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Analytics queries always filter by merchant_id + time window
CREATE INDEX IF NOT EXISTS idx_merchant_visits_merchant_id
  ON merchant_visits(merchant_id, visited_at DESC);

-- ── Recently-viewed lookup (one row per user+merchant pair) ───────────────────
CREATE TABLE IF NOT EXISTS user_merchant_last_visit (
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  last_visited_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, merchant_id)
);

-- Recently-viewed query: filter by user_id, sort by last_visited_at DESC
CREATE INDEX IF NOT EXISTS idx_user_merchant_last_visit_user_id
  ON user_merchant_last_visit(user_id, last_visited_at DESC);
