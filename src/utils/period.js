'use strict';

/**
 * Single source of truth for what "today"/"this month"/etc. mean across the
 * merchant portal — the dashboard tile counts and the drill-down history
 * lists must use the exact same boundaries, or they can disagree (a tile
 * says 3, the list behind it says 2). Never compute these on the client.
 */
function getPeriodBounds(period) {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  if (period === 'today') {
    return { date_from: `${todayStr} 00:00:00`, date_to: `${todayStr} 23:59:59` };
  }

  if (period === 'yesterday') {
    const y = new Date(now);
    y.setUTCDate(y.getUTCDate() - 1);
    const yStr = y.toISOString().split('T')[0];
    return { date_from: `${yStr} 00:00:00`, date_to: `${yStr} 23:59:59` };
  }

  if (period === 'month') {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      .toISOString().split('T')[0];
    return { date_from: `${monthStart} 00:00:00`, date_to: `${todayStr} 23:59:59` };
  }

  if (period === 'last_month') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
      .toISOString().split('T')[0];
    // Day 0 of the current month = last day of the previous month
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0))
      .toISOString().split('T')[0];
    return { date_from: `${start} 00:00:00`, date_to: `${end} 23:59:59` };
  }

  return {};
}

module.exports = { getPeriodBounds };
