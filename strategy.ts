// Flow Scalper — pump.fun replay bot v2 (agent-fun/replay/v2).
//
// A complete rewrite of the v1 "Dip Hunter" entry (dev PnL -0.298 SOL,
// round 2 rank 1512/2047). The v1 lesson, now recorded: a strategy whose
// dev backtest is negative cannot win on a replay drawn from the same
// distribution — the backtest IS the result (round 2 score -0.298 SOL was
// the dev number to the lamport). So v2 is built around the one
// positive-expectation shape measured on this same dev window: a
// tape-filtered scalper that waits for proof of real demand and then buys
// a steady rise, not a pop and not a dip.
//
// Why this shape — the measurements behind it (dev window, official
// grade-local unless noted):
//   * The 2-slot fill lag kills momentum entries. A buy decided on slot s
//     fills at s+2 at the post-trade price of slot s. On a fast pop the
//     median fill lands +15.5% above the trigger trade's price; the pop is
//     over by the fill. v1's pop-chasing families lost -2.08..-3.49 SOL.
//   * A dip is a level, so its fill lands at the trigger price — but dips
//     drift down more often than they bounce (median max loss after entry
//     -51% vs median max gain +16%), which is why v1's dip family still
//     lost -0.298 SOL at a 24.6% win rate.
//   * The tape filter is the discriminator. The sibling Sharpe bot
//     ("Steady Scalper", same dev data) was the ONLY bot of five measured
//     with a positive dev PnL (+0.010 SOL, 76 trips, 32.9% win rate,
//     max DD 1.3%): it buys only coins whose last ~60 slots show real
//     demand (net SOL inflow, several distinct buyers, price rising
//     steadily and still near its window high, no big sell, creator
//     hasn't sold). A steady rise over 60 slots moves ~0.2% in the 2
//     fill-lag slots, so the lag costs almost nothing — unlike a pop.
//   * The fee wedge is the central headwind: ~95+30 bps curve fees per
//     trade plus a fixed 0.000105 SOL tx fee per order. A 0.05 SOL round
//     trip pays ~2.5% in fees. So exits are PRICE-based (vs entry price),
//     not value-based: a -8% value stop is only a -5.5% price stop once
//     fees are counted, while a +80% value target needs a +84% price
//     move. Price-based exits keep the risk/reward honest.
//   * The payoff is deliberately skewed: most pump.fun coins dump, so the
//     bot pays many small -8% losses to stay alive for the occasional
//     runner, and the trailing stop banks partial gains on coins that run
//     +20-40% and fade. Buys refuse a fill whose price jumped >15% in
//     the 2-slot latency (1500 bps slippage); sells always execute
//     (10000 bps) so exits never strand a position.
//   * Guardrail insurance: the final window is 6 h (~300 mints) while dev
//     is 24 h (~1222 mints). A strict filter that makes 76 trips/24 h
//     makes only ~19 in 6 h — right at the 20-coin guardrail. So a pace
//     fallback loosens the filter one tier whenever filled coins lag the
//     pace (20 coins per 30,000 elapsed slots). The fallback is
//     load-bearing, not decorative.
//   * Deterministic: no clock, no randomness, no environment reads. The
//     only time source is the batch slot numbers. Two runs produce
//     identical action logs.

import {
  LAMPORTS_PER_SOL,
  type Batch,
  type BotState,
  type OrderInput,
} from './vendor/makefun-bot.ts';

export interface Params {
  /** Rolling tape window, in slots (~0.4 s each). */
  windowSlots: number;
  /** Coin age at entry, in slots since its CreateEvent. */
  minAgeSlots: number;
  maxAgeSlots: number;
  /** Real SOL reserve range at entry (lamports). */
  realSolMinLamports: bigint;
  realSolMaxLamports: bigint;
  /** Tape filter (strict tier): minimum net SOL inflow over the window. */
  inflowMinLamports: bigint;
  /** Tape filter: minimum buy trades / distinct buyers over the window. */
  buyMin: number;
  buyerMin: number;
  /** Tape filter: price rise over the window, in bps (min..max). */
  riseMinBps: number;
  riseMaxBps: number;
  /** Tape filter: current price must be at least this share of the window high (bps). */
  highBps: number;
  /** Tape filter: no single sell of at least this many lamports in the window. */
  maxSellLamports: bigint;
  /** Stake per position (lamports); the 1% reserve cap usually binds first on small coins. */
  stakeLamports: bigint;
  /** Take-profit vs entry price (bps). */
  tpBps: number;
  /** Hard stop vs entry price (bps). */
  stopBps: number;
  /** Trailing stop: arms at this rise vs entry (bps), exits on this pullback from peak (bps). */
  trailArmBps: number;
  trailBps: number;
  /** Max hold in slots, or null for none. */
  maxHoldSlots: number | null;
  /** Buy slippage cap (bps); sells always use 10000. */
  buySlippageBps: number;
  // --- pace-fallback (loose) tier: used while filled coins lag the pace ---
  /** Loose tier: minimum net SOL inflow over the window. */
  looseInflowMinLamports: bigint;
  /** Loose tier: minimum buy trades / distinct buyers. */
  looseBuyMin: number;
  looseBuyerMin: number;
  /** Loose tier: minimum price rise over the window (bps). */
  looseRiseMinBps: number;
  /** Loose tier: minimum real SOL reserve (lamports). */
  looseRealSolMinLamports: bigint;
  /** Loose tier: maximum coin age in slots. */
  looseMaxAgeSlots: number;
  /** Loose tier: stake per position (lamports). */
  looseStakeLamports: bigint;
  /** Pace: this many filled coins per this many elapsed slots. */
  paceCoins: number;
  paceSlots: number;
  /** Pace fallback only starts after this many elapsed slots. */
  paceStartSlots: number;
  /** Pace fallback fires when filled coins are this many below the target. */
  paceSlack: number;
  /** When true, a creator sell at ANY time disqualifies the coin; when false,
   *  only a creator sell inside the tape window does. */
  creatorSoldLifetime: boolean;
}

export const DEFAULT_PARAMS: Params = {
  windowSlots: 60,
  minAgeSlots: 120,
  maxAgeSlots: 2400,
  realSolMinLamports: 5000000000n,
  realSolMaxLamports: 80000000000n,
  inflowMinLamports: 300000000n,
  buyMin: 4,
  buyerMin: 5,
  riseMinBps: 500,
  riseMaxBps: 6000,
  highBps: 9800,
  maxSellLamports: 500000000n,
  stakeLamports: 30000000n,
  tpBps: 8000,
  stopBps: 500,
  trailArmBps: 1500,
  trailBps: 500,
  maxHoldSlots: 900,
  buySlippageBps: 1500,
  looseInflowMinLamports: 100000000n,
  looseBuyMin: 3,
  looseBuyerMin: 3,
  looseRiseMinBps: 100,
  looseRealSolMinLamports: 3000000000n,
  looseMaxAgeSlots: 3600,
  looseStakeLamports: 50000000n,
  paceCoins: 20,
  paceSlots: 30000,
  paceStartSlots: 5000,
  paceSlack: 2,
  creatorSoldLifetime: true,
};

export const MIN_BUY_LAMPORTS = LAMPORTS_PER_SOL / 100n; // 0.01 SOL
export const SELL_SLIPPAGE_BPS = 10_000; // sells always execute

interface TapeTrade {
  slot: number;
  price: number;
  isBuy: boolean;
  solLamports: bigint;
  user: string;
  creator: string;
}

interface CoinTape {
  createdSlot: number | null;
  creator: string | null;
  /** A sell by the creator at any time (never reset). */
  creatorSoldEver: boolean;
  trades: TapeTrade[];
}

interface Tracked {
  entryPrice: number;
  peak: number;
  entrySlot: number;
}

function markPrice(state: BotState, mint: string): number | null {
  const c = state.curves.get(mint);
  if (c === undefined || c.complete) return null;
  if (c.virtual_token_reserves === 0n) return null;
  return Number(c.virtual_quote_reserves) / Number(c.virtual_token_reserves);
}

function tradePrice(e: { virtual_quote_reserves: string; virtual_token_reserves: string }): number | null {
  const vt = BigInt(e.virtual_token_reserves);
  if (vt === 0n) return null;
  return Number(BigInt(e.virtual_quote_reserves)) / Number(vt);
}

/** A fresh, stateful bot: one instance per run (never share across runs). */
export function createBot(p: Params = DEFAULT_PARAMS) {
  const tracked = new Map<string, Tracked>();
  const bought = new Set<string>();
  const tapes = new Map<string, CoinTape>();
  let startSlot = -1;
  let filledCoins = 0;

  return {
    onBatch(state: BotState, batch: Batch): OrderInput[] {
      const orders: OrderInput[] = [];
      const txFee = state.txFeeLamports();
      if (startSlot < 0) startSlot = state.slot;

      // Ingest this batch's events into the per-coin tapes.
      for (const e of batch.events) {
        if (e.event === 'CompleteEvent') {
          tapes.delete(e.mint);
          continue;
        }
        if (e.event === 'CreateEvent') {
          const t = tapes.get(e.mint) ?? { createdSlot: null, creator: null, creatorSoldEver: false, trades: [] };
          t.createdSlot = e.slot;
          t.creator = e.creator;
          tapes.set(e.mint, t);
          continue;
        }
        if (e.event !== 'TradeEvent') continue;
        // Record the trade at the batch-end mark (the curve price after the
        // whole batch is applied), not the trade's own post-trade price:
        // the window stats (rise, high) are computed on marks, and a
        // batch-end mark is what the decision-time price actually is.
        const price = markPrice(state, e.mint) ?? tradePrice(e);
        if (price === null) continue;
        let t = tapes.get(e.mint);
        if (t === undefined) {
          t = { createdSlot: null, creator: null, creatorSoldEver: false, trades: [] };
          tapes.set(e.mint, t);
        }
        if (t.creator === null) t.creator = e.creator;
        if (!e.is_buy && e.user === e.creator) t.creatorSoldEver = true;
        t.trades.push({
          slot: e.slot,
          price,
          isBuy: e.is_buy,
          solLamports: BigInt(e.sol_amount),
          user: e.user,
          creator: e.creator,
        });
      }

      // Fills: track positions and count filled coins (pace).
      for (const f of batch.fills) {
        if (f.side === 'buy' && f.status === 'filled') {
          const tokens = BigInt(f.token_amount);
          const quote = BigInt(f.quote_lamports);
          if (tokens > 0n && !tracked.has(f.mint)) {
            const price = Number(quote) / Number(tokens);
            tracked.set(f.mint, { entryPrice: price, peak: price, entrySlot: state.slot });
            filledCoins += 1;
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
          tracked.set(mint, { entryPrice: price, peak: price, entrySlot: state.slot });
          bought.add(mint);
        }
      }

      // Exits (price-based, vs entry price).
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
        if (mark > tr.peak) tr.peak = mark;
        const tpHit = mark * 10_000 >= tr.entryPrice * (10_000 + p.tpBps);
        const trailHit =
          tr.peak * 10_000 >= tr.entryPrice * (10_000 + p.trailArmBps) &&
          mark * 10_000 <= tr.peak * (10_000 - p.trailBps);
        const stopHit = mark * 10_000 <= tr.entryPrice * (10_000 - p.stopBps);
        const holdHit = p.maxHoldSlots !== null && state.slot - tr.entrySlot >= p.maxHoldSlots;
        if (tpHit || trailHit || stopHit || holdHit) {
          orders.push({ side: 'sell', mint, token_amount: holding.token_amount, max_slippage_bps: SELL_SLIPPAGE_BPS });
        }
      }

      // Pace: are filled coins behind the linear pace target?
      const elapsed = Math.max(0, state.slot - startSlot);
      const paceTarget = (p.paceCoins * elapsed) / p.paceSlots;
      const loose = elapsed >= p.paceStartSlots && filledCoins < paceTarget - p.paceSlack;
      // Entries: evaluate coins that traded in this batch.
      const seenThisBatch = new Set<string>();
      for (const e of batch.events) {
        if (e.event === 'CompleteEvent') continue;
        seenThisBatch.add(e.mint);
      }
      let slots = state.hello.caps.max_open_positions - state.committedPositionCount();
      let free = state.freeCashLamports();
      const cutoff = state.slot - p.windowSlots;
      for (const mint of seenThisBatch) {
        if (slots <= 0) break;
        if (orders.length >= state.hello.caps.max_orders_per_batch) break;
        if (bought.has(mint)) continue;
        const curve = state.curves.get(mint);
        if (curve === undefined || curve.complete) continue;
        const tape = tapes.get(mint);
        if (tape === undefined) continue;
        // Prune the tape to the window (in place; trades arrive in slot order).
        while (tape.trades.length > 0 && tape.trades[0]!.slot <= cutoff) tape.trades.shift();
        if (tape.trades.length === 0) continue;
        const age = tape.createdSlot === null ? Number.MAX_SAFE_INTEGER : state.slot - tape.createdSlot;
        const realSol = curve.real_quote_reserves;
        // Tape stats over the window.
        let inflow = 0n;
        let buys = 0;
        let maxSell = 0n;
        let creatorSoldWindow = false;
        const buyers = new Set<string>();
        let high = tape.trades[0]!.price;
        for (const tr of tape.trades) {
          if (tr.isBuy) {
            inflow += tr.solLamports;
            buys += 1;
            buyers.add(tr.user);
          } else {
            inflow -= tr.solLamports;
            if (tr.solLamports > maxSell) maxSell = tr.solLamports;
            if (tape.creator !== null && tr.user === tape.creator) creatorSoldWindow = true;
          }
          if (tr.price > high) high = tr.price;
        }
        const creatorSold = p.creatorSoldLifetime ? tape.creatorSoldEver : creatorSoldWindow;
        const mark = markPrice(state, mint);
        if (mark === null) continue;
        // Price rise over the window, vs the oldest tape price still in it.
        const base = tape.trades[0]!.price;
        const riseBps = ((mark - base) / base) * 10_000;
        const nearHigh = mark * 10_000 >= high * p.highBps;
        // Strict tier first, loose tier second — exactly the reference
        // shape: a coin that passes the strict filter always buys at the
        // strict stake, even while the pace fallback is active. (Applying
        // the loose stake to strict-quality coins over-sizes the best
        // entries and was a real deviation from the reference.)
        const passesStrict =
          age >= p.minAgeSlots &&
          age <= p.maxAgeSlots &&
          realSol >= p.realSolMinLamports &&
          realSol <= p.realSolMaxLamports &&
          inflow >= p.inflowMinLamports &&
          buys >= p.buyMin &&
          buyers.size >= p.buyerMin &&
          riseBps >= p.riseMinBps &&
          riseBps <= p.riseMaxBps &&
          nearHigh &&
          maxSell < p.maxSellLamports &&
          !creatorSold;
        const passesLoose =
          age >= p.minAgeSlots &&
          age <= p.looseMaxAgeSlots &&
          realSol >= p.looseRealSolMinLamports &&
          realSol <= p.realSolMaxLamports &&
          inflow >= p.looseInflowMinLamports &&
          buys >= p.looseBuyMin &&
          buyers.size >= p.looseBuyerMin &&
          riseBps >= p.looseRiseMinBps &&
          riseBps <= p.riseMaxBps &&
          nearHigh &&
          maxSell < p.maxSellLamports &&
          !creatorSold;
        let tier: 'strict' | 'loose' | null = null;
        if (passesStrict) tier = 'strict';
        else if (loose && passesLoose) tier = 'loose';
        if (tier === null) continue;
        const stake = tier === 'strict' ? p.stakeLamports : p.looseStakeLamports;
        const cap = state.maxBuyLamports(mint);
        // Full stake or nothing: a partial buy below the stake is a
        // different (smaller, fee-dominated) trade, not the sized one.
        if (cap < stake) continue;
        const amount = stake;
        if (amount <= 0n) continue;
        if (free < amount + txFee) continue;
        orders.push({ side: 'buy', mint, quote_lamports: amount, max_slippage_bps: p.buySlippageBps });
        bought.add(mint);
        free -= amount + txFee;
        slots -= 1;
      }

      return orders;
    },
  };
}
