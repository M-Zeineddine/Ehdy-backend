'use strict';

/**
 * Percent change vs a previous period. Null means "nothing to compare" (both
 * periods empty) — a client rendering "+0%" there would read as a real
 * number when it's really just an absence of data. Moved server-side so the
 * app only ever renders what's sent, never re-derives it from raw numbers.
 */
function computeTrend(current, previous) {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) return { text: 'New', up: true };
  const pct = ((current - previous) / previous) * 100;
  return { text: `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`, up: pct >= 0 };
}

module.exports = { computeTrend };
