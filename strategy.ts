// Dip Hunter strategy — pump.fun replay bot (agent-fun/replay/v2).
//
// Final entry (chosen after 9 sweep stages, ~50 configs, on the real engine):
//   buy the 25% retracement of a coin that already proved real demand
//   (real SOL >= 10), at most 0.20 SOL (the 1% reserve cap binds first at
//   0.10 SOL), one buy per coin; exit at +25% take-profit, -10% trailing
//   stop, -5% hard stop, or 600 s max hold, whichever comes first.
//
// Design notes (from the dev dataset + the real engine's fill mechanics):
//   * A buy decided on slot s fills at slot s+2, and the price the bot sees
//     is already the post-trade price of slot s. Measured on the dev window,
//     the median fill lands +15.5% above the price of the trade that first
//     made a coin buyable — the early "pop" is mostly over by the fill. Any
//     entry that chases the first pop buys the top. That killed 'early'
//     (-3.49 SOL), 'established' (-2.08), 'milestone' (-2.32) and
//     'whale'-following (-0.50) in the real engine.
//   * The dip entry survives because a retracement is a LEVEL, not a fast
//     move: the price stays in the dip zone, so the fill price ~ trigger
//     price (median fill/trigger 1.00x). Dips still drift down more often
//     than they bounce (median max loss after entry -51% vs median max gain
//     +16%), which is why the exits are tight: a -5% hard stop cuts the
//     falling knife early, a +25% take-profit banks the bounce when it comes,
//     and a 600 s max hold frees the 5 position slots.
//   * Completions are whale-driven and instantaneous (median largest single
//     buy 37 SOL; time from real SOL 40 to completion p50 = 0 s): not a
//     rideable edge, so the strategy never waits for graduation. The
//     'scout' variant (buy dust at creation, top up on proof) also lost
//     (-2.71..-6.35) — the tiny stakes pay the tx fee many times over and
//     the top-ups land at bad prices.
//   * The mean final multiple from trade #1 is +25%, but it is entirely
//     consumed by entering after the pop plus the fill lag; the realized
//     per-trip edge of the best family is ~-0.002 SOL (fees ~0.0018 + adverse
//     price ~0.0016). No tested family is positive on the dev window.
//   * With only 5 position slots, every position is time-boxed (600 s) so
//     quiet coins cannot clog a slot. The dip family makes ~119 trips over
//     24 h, i.e. ~30 over the final 6 h window — comfortably above the
//     20-coin guardrail; the more selective dip R20 (59 trips) would risk
//     failing it and was rejected for that reason.
//   * Deterministic: no clock, no randomness, no environment reads. The only
//     time source is the events' own timestamps. Two runs produce identical
//     action logs.

import {
  LAMPORTS_PER_SOL,
  type Batch,
  type BotState,
  type OrderInput,
} from './vendor/makefun-bot.ts';

export interface Params {
  /** Entry rule. */
  entry: 'early' | 'established' | 'dip' | 'milestone' | 'dip-confirm' | 'whale' | 'scout';
  /** 'whale': a single buy trade of at least this many lamports triggers a buy. */
  whaleMinLamports: bigint;
  /** 'scout': first buy when the cap reaches this (lamports); topped up to targetLamports at realSolMinLamports. */
  scoutMinLamports: bigint;
  /** 'established'/'dip'/'milestone'/'dip-confirm': minimum real SOL (lamports) before a buy. */
  realSolMinLamports: bigint;
  /** 'established': price must be up this much vs first-seen (bps). */
  riseBps: number;
  /** 'dip'/'dip-confirm': price must have retraced this much from its peak (bps). */
  dipBps: number;
  /** 'dip-confirm': price must have bounced this much off its post-peak trough (bps). */
  confirmBps: number;
  /** Max stake per coin (lamports); the 1% reserve cap usually binds first. */
  targetLamports: bigint;
  /** Fixed take-profit vs entry price (bps), or null for none. */
  tpBps: number | null;
  /** Trailing stop vs peak since entry (bps), or null for none. */
  trailBps: number | null;
  /** Hard stop vs entry price (bps). */
  stopBps: number;
  /** Max hold in event-time seconds, or null for none. */
  maxHoldSec: number | null;
  /** Sell when the coin has had no trade for this many event-time seconds (null: off). */
  idleSec: number | null;
}

export const DEFAULT_PARAMS: Params = {
  entry: 'dip',
  realSolMinLamports: 10n * LAMPORTS_PER_SOL,
  whaleMinLamports: 5n * LAMPORTS_PER_SOL,
  scoutMinLamports: LAMPORTS_PER_SOL / 1000n, // 0.001 SOL: first dust the cap allows
  riseBps: 3000, // +30% vs first-seen price
  dipBps: 2500, // -25% from peak
  confirmBps: 500, // +5% off the post-peak trough
  targetLamports: LAMPORTS_PER_SOL / 5n, // 0.20 SOL
  tpBps: 2500, // +25%
  trailBps: 1000, // -10% from peak
  stopBps: 500, // -5% from entry: cut losers fast (sweep: stop2-5% is the flat best region)
  maxHoldSec: 600,
  idleSec: null, // idle exit is for the ride-the-tail family, not the dip
};

export const MIN_BUY_LAMPORTS = LAMPORTS_PER_SOL / 100n; // 0.01 SOL
export const SCOUT_SIZE_LAMPORTS = LAMPORTS_PER_SOL / 100n; // 0.01 SOL scout stake
export const MAX_SLIPPAGE_BPS = 10_000; // fill at market; 2-slot latency moves price little

interface Tracked {
  entryPrice: number;
  peak: number;
  entryTime: number;
  lastMark: number;
  /** Event-time seconds of this coin's latest trade (for the idle exit). */
  lastTradeTime: number;
}

interface CoinInfo {
  firstPrice: number;
  peak: number;
  firstSeenTime: number;
  /** Lowest mark since the peak was set (for dip-confirm). */
  trough: number;
  /** A single buy trade >= whaleMinLamports was seen on this coin. */
  whale: boolean;
}

function markPrice(state: BotState, mint: string): number | null {
  const c = state.curves.get(mint);
  if (c === undefined || c.complete) return null;
  if (c.virtual_token_reserves === 0n) return null;
  return Number(c.virtual_quote_reserves) / Number(c.virtual_token_reserves);
}

/** A fresh, stateful bot: one instance per run (never share across runs). */
export function createBot(p: Params = DEFAULT_PARAMS) {
  const tracked = new Map<string, Tracked>();
  const bought = new Set<string>();
  const candidates = new Map<string, CoinInfo>();
  /** Lamports already spent per mint (scout + top-up accounting). */
  const spent = new Map<string, bigint>();
  let nowSec = 0;

  return {
    onBatch(state: BotState, batch: Batch): OrderInput[] {
      const orders: OrderInput[] = [];
      const txFee = state.txFeeLamports();

      for (const e of batch.events) {
        const t = Number(e.timestamp);
        if (Number.isFinite(t) && t > nowSec) nowSec = t;
        if (e.event === 'TradeEvent') {
          const tr = tracked.get(e.mint);
          if (tr !== undefined && Number.isFinite(t)) tr.lastTradeTime = Math.max(tr.lastTradeTime, t);
        }
      }

      for (const f of batch.fills) {
        if (f.side === 'buy' && f.status === 'filled') {
          const tokens = BigInt(f.token_amount);
          const quote = BigInt(f.quote_lamports);
          if (tokens > 0n && !tracked.has(f.mint)) {
            const price = Number(quote) / Number(tokens);
            tracked.set(f.mint, { entryPrice: price, peak: price, entryTime: nowSec, lastMark: price, lastTradeTime: nowSec });
          }
          bought.add(f.mint);
        } else if (f.side === 'sell' && f.status === 'filled') {
          tracked.delete(f.mint);
        }
      }
      for (const mint of [...tracked.keys()]) {
        if (!state.positions.has(mint)) tracked.delete(mint);
      }
      for (const [mint, holding] of state.positions) {
        if (!tracked.has(mint)) {
          const mark = markPrice(state, mint);
          const price = mark ?? Number(holding.cost_lamports) / Math.max(1, Number(holding.token_amount));
          tracked.set(mint, { entryPrice: price, peak: price, entryTime: nowSec, lastMark: price, lastTradeTime: nowSec });
          bought.add(mint);
        }
      }

      // Exits.
      for (const [mint, holding] of state.positions) {
        const tr = tracked.get(mint);
        if (tr === undefined) continue;
        let sellPending = false;
        for (const po of state.pending.values()) {
          if (po.order.mint === mint && po.order.side === 'sell') {
            sellPending = true;
            break;
          }
        }
        if (sellPending) continue;
        const mark = markPrice(state, mint);
        if (mark === null) continue;
        tr.lastMark = mark;
        if (mark > tr.peak) tr.peak = mark;
        const tpHit = p.tpBps !== null && mark * 10_000 >= tr.entryPrice * (10_000 + p.tpBps);
        const trailHit = p.trailBps !== null && mark * 10_000 <= tr.peak * (10_000 - p.trailBps);
        const stopHit = mark * 10_000 <= tr.entryPrice * (10_000 - p.stopBps);
        const holdHit = p.maxHoldSec !== null && nowSec - tr.entryTime >= p.maxHoldSec;
        const idleHit = p.idleSec !== null && nowSec - tr.lastTradeTime >= p.idleSec;
        if (tpHit || trailHit || stopHit || holdHit || idleHit) {
          orders.push({ side: 'sell', mint, token_amount: holding.token_amount, max_slippage_bps: MAX_SLIPPAGE_BPS });
        }
      }

      // Entries.
      for (const e of batch.events) {
        if (e.event === 'CompleteEvent') {
          candidates.delete(e.mint);
          continue;
        }
        if (!bought.has(e.mint) && !candidates.has(e.mint)) {
          const mark = markPrice(state, e.mint);
          if (mark !== null) candidates.set(e.mint, { firstPrice: mark, peak: mark, firstSeenTime: nowSec, trough: mark, whale: false });
        }
        // Whale trigger: one big buy trade on this coin.
        if (e.event === 'TradeEvent' && e.is_buy) {
          const info = candidates.get(e.mint);
          if (info !== undefined && BigInt(e.sol_amount) >= p.whaleMinLamports) info.whale = true;
        }
      }
      // Refresh peaks/troughs for candidates from current marks.
      for (const [mint, info] of candidates) {
        const mark = markPrice(state, mint);
        if (mark === null) continue;
        if (mark > info.peak) {
          info.peak = mark;
          info.trough = mark; // a new peak resets the trough
        } else if (mark < info.trough) {
          info.trough = mark;
        }
      }
      let slots = state.hello.caps.max_open_positions - state.committedPositionCount();
      let free = state.freeCashLamports();
      for (const [mint, info] of [...candidates]) {
        if (slots <= 0) break;
        if (orders.length >= state.hello.caps.max_orders_per_batch) break;
        const curve = state.curves.get(mint);
        if (curve === undefined || curve.complete) {
          candidates.delete(mint);
          continue;
        }
        const cap = state.maxBuyLamports(mint);
        const minCap = p.entry === 'scout' ? p.scoutMinLamports : MIN_BUY_LAMPORTS;
        if (cap < minCap) continue; // not buyable yet; keep waiting
        const mark = markPrice(state, mint);
        if (mark === null) continue;
        let ok = false;
        if (p.entry === 'early') {
          ok = true;
        } else if (p.entry === 'established') {
          ok = curve.real_quote_reserves >= p.realSolMinLamports && mark * 10_000 >= info.firstPrice * (10_000 + p.riseBps);
        } else if (p.entry === 'milestone') {
          // Buy the moment the coin first proves real demand (real SOL >= R):
          // the rise is implied (price ~ (1 + R/30)^2 vs creation) and the
          // entry is not delayed by an extra rise filter.
          ok = curve.real_quote_reserves >= p.realSolMinLamports;
        } else if (p.entry === 'dip') {
          // Dip: retraced from its peak, still above first-seen, real activity present.
          ok =
            curve.real_quote_reserves >= p.realSolMinLamports &&
            mark * 10_000 <= info.peak * (10_000 - p.dipBps) &&
            mark >= info.firstPrice;
        } else if (p.entry === 'dip-confirm') {
          // dip-confirm: as dip, plus the price has bounced off its post-peak trough.
          ok =
            curve.real_quote_reserves >= p.realSolMinLamports &&
            mark * 10_000 <= info.peak * (10_000 - p.dipBps) &&
            mark >= info.firstPrice &&
            mark * 10_000 >= info.trough * (10_000 + p.confirmBps);
        } else if (p.entry === 'whale') {
          // whale: a single big buy was seen; ride the wave that follows it.
          ok = info.whale;
        } else {
          // scout: buy the first dust the cap allows (near creation price,
          // while the coin is quiet and the fill lag is small), then top up
          // once to the target when real SOL proves demand.
          const already = spent.get(mint) ?? 0n;
          if (already === 0n) {
            ok = cap >= p.scoutMinLamports;
          } else {
            ok = curve.real_quote_reserves >= p.realSolMinLamports && already < p.targetLamports;
          }
        }
        if (!ok) continue;
        const already = spent.get(mint) ?? 0n;
        let amount: bigint;
        let isNewSlot: boolean;
        if (p.entry === 'scout' && already === 0n) {
          // First dust: at most the scout size, however big the cap already is.
          amount = cap < SCOUT_SIZE_LAMPORTS ? cap : SCOUT_SIZE_LAMPORTS;
          isNewSlot = true;
        } else if (p.entry === 'scout') {
          amount = cap < p.targetLamports - already ? cap : p.targetLamports - already;
          isNewSlot = false; // topping up a slot we already hold
        } else {
          amount = cap < p.targetLamports ? cap : p.targetLamports;
          isNewSlot = true;
        }
        if (amount <= 0n) continue;
        if (free < amount + txFee) continue;
        // Scout's first dust leaves the coin a candidate (the top-up comes
        // later); every other buy ends buying on that coin.
        if (!(p.entry === 'scout' && already === 0n)) candidates.delete(mint);
        orders.push({ side: 'buy', mint, quote_lamports: amount, max_slippage_bps: MAX_SLIPPAGE_BPS });
        spent.set(mint, already + amount);
        bought.add(mint);
        free -= amount + txFee;
        if (isNewSlot) slots -= 1;
      }

      return orders;
    },
  };
}
