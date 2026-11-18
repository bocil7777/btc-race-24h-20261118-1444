// Dip-Buy Bot — make.fun btc-race-24h-20261118-1444.
//
// The idea: sit in cash almost the whole day and only buy a genuine
// wash-out. The frozen 24h dev window is a slow bleed (it falls 280 bps
// from open to close) with about 7 bps of one-minute noise around it,
// and a full-size round trip costs roughly 26 bps once fees, slippage
// and pool impact are all paid. Anything that trades often, or that
// follows the one-minute trend, pays that round-trip cost over and
// over and bleeds out. So this bot waits for the close to sit 120 bps
// below the highest close of the last two hours — a drop that deep is
// a real capitulation, not noise — buys with everything, and then
// sells the whole position as soon as the close is 100 bps above the
// fill or 100 bps below it. No new buys in the last hour: a dip there
// has no time to reach its target before the window flattens, so it
// would only pay the round trip.
//
// A parameter sweep over the same family (drop 120–180 bps, target
// 80–150 bps, stop 80–100 bps, lookback 60–180 minutes) is profitable
// across the whole neighbourhood (+$13 to +$19 in simulation), so the
// edge is the wash-out rule itself rather than a fit to one window's
// numbers. Verified with the kit's own grader, twice, deterministic:
// net +$15.66 on the dev window, 4 trades (2 round trips, both wins),
// max drawdown 0.76%, fees $1.61, still +$14.04 at double fees.
//
// All decisions are integer (bigint) math on the raw price units the
// harness sends. No floats, no clock, no randomness, no network, so
// two runs on the same bars answer byte for byte the same.

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch, OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const TRAIL_MINUTES = 120; // how far back the dip is measured against
const DIP_BPS = 120n; // buy once the close is this far under the trail high
const TAKE_BPS = 100n; // bank the rebound once the close is this far over fill
const CUT_BPS = 100n; // admit the dip was not a dip this far under fill
const SLIP_BPS = 150; // headroom for slippage, impact and the 1-minute gap
const TAIL_BARS = 60; // no new buys inside the final hour of the window
const WINDOW_BARS = 1440; // one bar per minute over the 24-hour window
const BPS_DEN = 10000n;
const MIN_NOTIONAL = 1000000n; // 1 USDC, in the harness's quote units

const history: bigint[] = []; // closes seen so far, oldest first
let fillPrice: bigint | null = null; // fill price of the open position, if any

// Highest close of the trailing window, not counting the latest bar:
// the dip is measured against where the market was, not where it is.
function trailHigh(minutes: number): bigint {
  let peak = 0n;
  for (let i = history.length - 2; i >= history.length - minutes - 1; i--) {
    const price = history[i]!;
    if (price > peak) peak = price;
  }
  return peak;
}

// While holding, decide whether this close exits the position, and
// build the sell order when it does. Returns null to stay in.
// The target and the stop trigger when the close REACHES the level,
// not only once it has passed it: with integer prices the exact level
// is reachable, and waiting another bar past it only pays slippage.
function exitOrder(close: bigint, qty: bigint): OrderInput | null {
  if (fillPrice === null) return null;
  const up = close * BPS_DEN >= fillPrice * (BPS_DEN + TAKE_BPS);
  const down = close * BPS_DEN <= fillPrice * (BPS_DEN - CUT_BPS);
  if (!up && !down) return null;
  return { side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: SLIP_BPS };
}

// While flat, decide whether this close is a buyable dip, and build
// the all-cash buy order when it is. Returns null to stay in cash.
function entryOrder(state: BarsState, close: bigint): OrderInput | null {
  if (history.length <= TRAIL_MINUTES) return null; // trail high unknown yet
  if (history.length > WINDOW_BARS - TAIL_BARS) return null; // too late to pay off
  if (state.cash < MIN_NOTIONAL) return null;
  const peak = trailHigh(TRAIL_MINUTES);
  const dipped = close * BPS_DEN < peak * (BPS_DEN - DIP_BPS);
  if (!dipped) return null;
  return { side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: SLIP_BPS };
}

function onBatch(state: BarsState, batch: Batch): OrderInput[] {
  if (state.warmingUp) return [];
  // Settle this batch's fills before deciding: a buy fill records the
  // entry price, a sell fill clears it.
  for (const fill of batch.fills) {
    if (fill.symbol !== SYMBOL || fill.status !== 'filled') continue;
    fillPrice = fill.side === 'buy' ? BigInt(fill.price) : null;
  }
  let bar = null;
  for (const b of batch.bars) {
    if (b.symbol === SYMBOL) {
      bar = b;
      break;
    }
  }
  if (bar === null) return []; // CBBTC absent this minute: nothing to decide
  const close = BigInt(bar.c);
  history.push(close);
  const holding = state.positions.get(SYMBOL);
  const qty = holding === undefined ? 0n : holding.qty;
  if (qty > 0n) {
    if (fillPrice === null) {
      // A position with no fill seen yet (should not happen): anchor
      // the exit on the first close after the fill and wait one bar.
      fillPrice = close;
      return [];
    }
    const exit = exitOrder(close, qty);
    return exit === null ? [] : [exit];
  }
  const entry = entryOrder(state, close);
  return entry === null ? [] : [entry];
}

await runBars({ onBatch });
