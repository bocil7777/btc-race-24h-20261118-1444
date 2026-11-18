// Dip-buy bot for the make.fun btc-race-24h-20261118-1444 race.
//
// Strategy, tuned on the frozen 24h dev window (grade-local verified):
// the dev window drifts down 280 bps over 24 hours in choppy 1-minute
// noise (about 7 bps per bar) around slow multi-hour drifts, and a
// full-size round trip costs roughly 26 bps in fees, slippage and pool
// impact. Trend-following on 1-minute bars whipsaws itself to death
// there, so this bot trades rarely and only after a real wash-out:
//
// - BUY the whole cash balance when the latest close sits at least
//   120 bps below the highest close of the trailing 120 minutes.
//   A drop that deep is a genuine capitulation, not noise, and the
//   window's big drops were followed by recoveries.
// - SELL everything when the close rises 100 bps above the entry
//   fill price (take the rebound), or falls 100 bps below it
//   (the dip was not a dip, cut it).
//
// The same design was profitable on the previous race's dev window
// (+$17 there) and on this one the whole neighbourhood is profitable:
// drop 120-180 bps, target 80-150 bps, stop 80-100 bps and lookback
// 60-180 minutes all clear +$13 to +$19 in simulation, so the edge
// is the wash-out logic itself, not a fit to one window's numbers.
// On this dev window that is 2 trades for about +$18 net, max
// drawdown about 0.7%. Everything is integer (bigint) arithmetic on
// the raw price units the harness sends, no floats, no clock, no
// randomness, so two runs on the same data answer byte for byte the
// same.
//
// A buy spends all cash; a sell empties the position.
// max_slippage_bps 150 gives room for the modelled slippage plus
// impact (about 13 bps) and the usual 1-minute gap (at most 64 bps
// on the dev window) without ever chasing a wild open.

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch, OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const LOOKBACK = 120; // minutes of trailing high for the dip test
const DROP_BPS = 120n; // buy when close is this far below the trailing high
const TARGET_BPS = 100n; // sell when close is this far above the entry fill
const STOP_BPS = 100n; // sell when close is this far below the entry fill
const MAX_SLIPPAGE_BPS = 150;
const NO_NEW_ENTRIES_LAST_BARS = 60; // a dip in the final hour has no
// time to reach its target before the flatten, so it would only pay
// the round-trip cost: stay flat and let the window close.
const BPS = 10000n;

const closes: bigint[] = []; // raw close prices, one per bar, in order
let entryPx: bigint | null = null; // raw fill price of the open position

function onBatch(state: BarsState, batch: Batch): OrderInput[] {
  if (state.warmingUp) return [];
  // Fold this batch's fills in first: a buy fill sets the entry
  // price, a sell fill clears it.
  for (const fill of batch.fills) {
    if (fill.symbol !== SYMBOL || fill.status !== 'filled') continue;
    if (fill.side === 'buy') entryPx = BigInt(fill.price);
    else entryPx = null;
  }
  let bar = null;
  for (const b of batch.bars) {
    if (b.symbol === SYMBOL) {
      bar = b;
      break;
    }
  }
  if (bar === null) return []; // no CBBTC bar this minute: nothing to decide
  const close = BigInt(bar.c);
  closes.push(close);
  const holding = state.positions.get(SYMBOL);
  const qty = holding === undefined ? 0n : holding.qty;
  if (qty > 0n) {
    if (entryPx === null) {
      // Position open but no fill seen (should not happen):
      // use the first close after the fill as the reference.
      entryPx = close;
      return [];
    }
    if (close * BPS > entryPx * (BPS + TARGET_BPS)) {
      return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    if (close * BPS < entryPx * (BPS - STOP_BPS)) {
      return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  }
  // Flat: buy the dip, all cash, once the trailing high is known.
  // No new entries in the final hour: nothing left to gain from them.
  if (closes.length <= LOOKBACK) return [];
  if (closes.length >= 1440 - NO_NEW_ENTRIES_LAST_BARS + 1) return [];
  let high = 0n;
  for (let i = closes.length - LOOKBACK - 1; i < closes.length - 1; i++) {
    if (closes[i]! > high) high = closes[i]!;
  }
  if (close * BPS < high * (BPS - DROP_BPS)) {
    if (state.cash >= 1000000n) {
      return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
  }
  return [];
}

await runBars({ onBatch });
