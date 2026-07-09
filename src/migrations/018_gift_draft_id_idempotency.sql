-- ============================================================================
-- Migration 018 (A7): draft-keyed payment idempotency (schema half of the
-- double-charge fix). The runner wraps this file in a single BEGIN/COMMIT.
--
-- INERT UNTIL THE CLIENT SENDS gift_draft_id: the partial unique index below
-- only constrains rows where gift_draft_id IS NOT NULL. Until the app passes a
-- stable gift_draft_id to POST /v1/gifts/initiate-payment (frontend C1) and
-- giftService.initiateGiftPayment persists it, every gifts_sent row keeps
-- gift_draft_id = NULL and the index does nothing. The only live idempotency
-- guard until then remains the existing 5-minute (user, item, recipient_phone)
-- window. No backfill is needed — existing NULL rows are ignored by the index.
-- ============================================================================

-- ON DELETE SET NULL is required: the payment callback deletes the retry draft
-- on success (deleteRetryDraft). With the default NO ACTION, deleting a draft
-- referenced by a gifts_sent row would raise an FK violation. SET NULL is safe:
-- by the time the draft is deleted the row is 'paid', so it is already outside
-- the partial unique index below (which only covers payment_status='pending').
ALTER TABLE gifts_sent
  ADD COLUMN IF NOT EXISTS gift_draft_id uuid
    REFERENCES gift_drafts(id) ON DELETE SET NULL;

-- At most one unresolved (pending) payment attempt per draft.
CREATE UNIQUE INDEX IF NOT EXISTS gifts_sent_one_pending_per_draft
  ON gifts_sent (gift_draft_id)
  WHERE payment_status = 'pending' AND gift_draft_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Accompanying application change (NOT part of this SQL; implement under A7
-- after approval, in giftService.initiateGiftPayment):
--   1. Persist the incoming draft id into gifts_sent.gift_draft_id.
--   2. Before creating a new pending row, look up an existing 'pending' row for
--      the same gift_draft_id; if found, return its existing charge/session
--      (or 409 with the existing gift_sent_id) instead of a second Tap charge.
--   3. Catch the unique_violation (23505) on gifts_sent_one_pending_per_draft
--      as the race-safe backstop and translate it to the same response.
--   4. Guard parseFloat(merchant_items.price): price is a NULLABLE column and
--      active items can legitimately have a null price. If the resolved price
--      is null or NaN, reject with a clear error (e.g. 400 INVALID_ITEM_PRICE)
--      instead of creating a Tap charge with a NaN amount.
--   5. Stale-pending sweeper (SAME PR): the partial unique index means an
--      abandoned checkout leaves a 'pending' row forever, and every retry on
--      that draft 409s against a dead Tap session. Add a node-cron job in
--      src/jobs/ (match the existing job pattern; no Bull) that fails abandoned
--      pending rows. Intended query (PENDING APPROVAL — do not implement yet):
--
--        UPDATE gifts_sent gs
--        SET payment_status = 'failed', updated_at = NOW()
--        WHERE gs.payment_status = 'pending'
--          AND gs.created_at < NOW() - INTERVAL '30 minutes'
--          AND NOT EXISTS (
--            SELECT 1 FROM payment_webhooks pw
--            WHERE pw.charge_id = gs.tap_charge_id
--              AND pw.status = 'CAPTURED'
--          );
-- ----------------------------------------------------------------------------
