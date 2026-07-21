'use strict';

/**
 * Single source of truth for what "today" and "this month" mean across the
 * merchant portal — the dashboard tile counts and the drill-down history
 * lists must use the exact same boundaries, or they can disagree (a tile
 * says 3, the list behind it says 2). Never compute these on the client.
 */
function getPeriodBounds(period) {
  if (period !== 'today' && period !== 'month') return {};

  const today = new Date().toISOString().split('T')[0];
  if (period === 'today') {
    return { date_from: `${today} 00:00:00`, date_to: `${today} 23:59:59` };
  }

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString().split('T')[0];
  return { date_from: `${monthStart} 00:00:00`, date_to: `${today} 23:59:59` };
}

module.exports = { getPeriodBounds };
