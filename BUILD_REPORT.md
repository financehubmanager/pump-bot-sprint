# BUILD REPORT — Pump.fun Bot Sprint v2: "Flow Scalper"

- **Competition:** `u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed` — "Pump.fun Bot Sprint: Make Bot And Win" ($2 total, 1st $1, 2nd $1; entries close 2026-11-28T08:00:00Z = 28 Nov 15:00 WIB; final replay 2026-11-28T08:00–14:00Z on unseen coins).
- **Repo:** `pump-bot-sprint/` — `main.ts` (thin entrypoint), `strategy.ts` (the strategy, rewritten from scratch for v2), `vendor/makefun-bot.ts` (kit SDK shim, vendored verbatim per its own header), `LICENSE` (MIT, SPDX line present), `README.md`.
- **Builder session:** 27 Nov 2026, ~14:35–16:00 WIB. Revision approved by the user 27 Nov 14:34 WIB.
- **v1 context:** "Dip Hunter" (submission 01a21b1d) scored **round 2: rank 1512/2047, −0.298 SOL** — exactly its dev backtest (−0.298154419 SOL). Lesson recorded: a negative-expectation strategy cannot win on a same-distribution replay; the backtest IS the result. Only a positive dev PnL can win. v2 was built to find one.

## Strategy — "Flow Scalper" (complete rewrite of strategy.ts)

A tape-filtered scalper: wait for proof of real demand, then buy a steady rise — not a pop and not a dip.

**Tape (per coin, rolling 60-slot window, ~24 s):** every trade is recorded at the batch-end mark price (the curve price after the whole batch is applied — the price the decision actually sees), with its SOL size (`sol_amount`), side, user, and slot. The tape also records the creation slot, the creator, and whether the creator has ever sold (lifetime flag).

**Entry — two tiers, strict first, loose only when the pace fallback is active:**

| Condition | Strict (tier 1) | Loose (tier 2) |
|---|---|---|
| Age | 120–2400 slots | 120–3600 slots |
| Real SOL reserves | 5–80 SOL | 3–80 SOL |
| Net inflow (60 slots) | ≥ 0.30 SOL | ≥ 0.10 SOL |
| Buy trades (60 slots) | ≥ 4 | ≥ 3 |
| Distinct buyers (60 slots) | ≥ 5 | ≥ 3 |
| Price rise over window | +5% to +60% | +1% to +60% |
| Price vs window high | ≥ 98% of high | ≥ 98% of high |
| Largest single sell (60 slots) | < 0.50 SOL | < 0.50 SOL |
| Creator sold (ever) | No | No |
| Stake | 0.03 SOL | 0.05 SOL |

One buy per coin ever. Max 5 open positions. A buy is sent only when the full stake fits under the 1% reserve cap (a partial buy below the stake is a different, fee-dominated trade, not the sized one); buy slippage 1500 bps.

**Pace fallback (loose tier):** the loose tier activates only when filled coins lag a linear pace target of 20 coins per 30,000 elapsed slots, starting after 5,000 elapsed slots, with 2 coins of slack (`filled < target − 2`). This keeps the entry rate up on quiet stretches without letting the loose tier dominate: without it the bot makes ~91 trips / 24 h; with it, ~111.

**Exits (first trigger wins, vs entry price = fill cost per token):** take-profit **+80%**, hard stop **−5%**, trailing stop arms at **+15%** and exits on a **−5%** pullback from the peak, max hold **900 slots** (~6 min). Sell slippage 10000 bps. A pending-sell guard prevents duplicate sells on the same position.

**Why this shape — the measurements behind it (dev window, official harness):**

1. **The 2-slot fill lag kills momentum and dips.** A buy decided on slot s fills at s+2. For pop-chasing entries the median fill lands +15.5% above the trigger price; for dips the fill lands at the trigger price — but dips drift down more often than they bounce (median max loss −51% vs max gain +16%). v1's dip family lost −0.298 SOL on dev and the same −0.298 in round 2.
2. **The one positive-expectation shape measured on this same dev window is a tape-filtered scalper.** The sibling "Steady Scalper" (Sharpe Sprint entry, same dataset `src-calib`, same window) measured dev PnL **+0.010 SOL, Sharpe +0.021/h, 76 trips**. v2 studies that shape and re-implements it from scratch — same family, own code and structure — then sweeps it for something better.
3. **Fees are the wall.** At 0.03–0.05 SOL stakes the round-trip fee wedge is ~2.5% curve + ~0.7% fixed tx fees. Gross edge must exceed ~3.2% per trip to break even. The strategy's gross edge on dev is ≈ +0.084 SOL over 111 trips (+0.0008/trip); fees (≈ 0.157 SOL) eat it and leave −0.056.

## Replication diagnosis (why v2 does not reproduce the sibling's +0.010)

While aligning v2 to the sibling's semantics I measured each difference with `grade-local` (~47 s/run) and with per-coin diagnostics:

- **Baseline S0** (my first rewrite, looser in three places): −0.422, 160 trips.
- **S0b** (buyers 5, stakes 0.03/0.05, creator-sold lifetime, pace start 5000 + slack 2): −0.184, 137 trips.
- **S0c** (full-stake-or-nothing cap check instead of partial buys): −0.174, 116 trips.
- **S0d** (tape prices = batch-end marks instead of per-trade post-trade prices): −0.151, 111 trips.
- **S2 tier fix** (a coin passing the strict filter buys at the strict 0.03 SOL stake even while the pace fallback is active — previously every coin bought during a loose-active batch got the loose 0.05 stake, over-sizing the best entries): **−0.0726, 111 trips.**
- **Decisive measurement:** a diagnostic replica of the sibling's entry filter run on v2's own tape data agreed with v2's tier on **every** coin evaluated (0 disagreements), and v2 buys a strict **superset** of the sibling's coins — all 78 of the sibling's coins plus 35 more (26 strict-tier, 9 loose-tier), all passing with wide margins (median inflow 3.38 SOL vs 0.30 threshold, median buyers 7 vs 5, median rise +15% vs +5%). So the filter logic is identical given the same tape; the residual gap is in tape/evaluation timing, not in the filter. The sibling itself re-graded on THIS kit's harness measures **−0.0035 SOL, 77 trips** (vs +0.010 on its own kit) — the +0.010 was partly tx-failure-seed luck, and the family is ~breakeven on this data, not robustly positive. Chasing the last 0.05 SOL of replication gap was therefore abandoned in favour of sweeping for a genuinely better configuration.

## Approaches tried (all on the official harness, `grade-local --driver process`, 24 h dev window)

| Approach | Config (key levers) | Net (SOL) | Trips | Win | Guardrail |
|---|---|---|---|---|---|
| v1 Dip Hunter (reference) | dip −25%, R10, tp25/trail10/stop5/hold600 | −0.298 | 118 | 24.6% | met |
| S0 Flow Scalper (first rewrite) | buyers 4, stakes 0.05/0.08, pace from slot 0 | −0.422 | 160 | 26.9% | met |
| S0b Sharpe-aligned | buyers 5, stakes 0.03/0.05, creator lifetime, pace 5000/−2 | −0.184 | 137 | 29.2% | met |
| S0c + cap-skip | full stake or nothing | −0.174 | 116 | 29.3% | met |
| S0d + batch-end marks | tape prices = batch-end marks | −0.151 | 111 | 29.7% | met |
| **S2 tier fix** | strict coins always buy at strict stake | **−0.0726** | 111 | 30.6% | met |
| S5a TP +150% | let winners run | −0.142 | 111 | 29.7% | met |
| S5b SL −5% | cut losers at −5% (was −8%) | −0.0673 | 111 | 25.2% | met |
| S5c tighter trail | trail arms +15%, exits −5% pullback | −0.0651 | 111 | 32.4% | met |
| S5d hold 450 | shorter max hold | −0.0974 | 111 | 31.5% | met |
| **S6d combo (FINAL)** | **SL −5% + trail 15%/−5%** | **−0.0556** | **111** | **26.1%** | **met** |
| S6a rise ≥ +10% | stronger-rise requirement | −0.0938 | 110 | 26.4% | met |
| S6b window 120 | longer tape window | −0.118 | 78 | 26.9% | met |
| S6c stricter quality | inflow ≥ 1.0 SOL, buyers ≥ 6, buys ≥ 5 | −0.0650 | 111 | 26.1% | met |
| S7a early momentum | min age 10 slots (buy very young coins) | −0.356 | 186 | 23.7% | met |
| S7b early + strong pressure | age 10–180, inflow ≥ 0.5, rise ≥ +2% | −0.326 | 183 | 24.0% | met |
| S8a bigger strict stake | strict stake 0.05 SOL | −0.121 | 111 | 26.1% | met |
| S8b tighter trail | trail arms +10%, exits −4% | −0.0789 | 111 | 27.9% | met |
| S8c SL −3% | cut losers at −3% | −0.120 | 111 | 20.7% | met |
| S8d TP +50% | take profit sooner | −0.0900 | 111 | 26.1% | met |
| S9a pullback 5–15% | buy 5–15% below window high | −0.0048 | 5 | 40.0% | **FAIL (5 < 20)** |
| S9b pullback 3–10% | buy 3–10% below window high | −0.0384 | 17 | 23.5% | **FAIL (17 < 20)** |
| S1 strict-only (no pace) | pace fallback disabled | −0.120 | 91 | 29.7% | met |

Neighbourhood of the final config (flat region, not a sharp peak): the exit sweep moved PnL only between −0.055 and −0.097 across TP 50–150%, SL 3–8%, trail 10–15%/4–8%, hold 450–900. The final config sits in the middle of that flat region. Bigger stakes, tighter stops, sooner take-profits, longer windows, stronger-rise requirements, and stricter quality filters all made it worse — the loss is structural (fee wedge + weak signal), not a tuning artefact.

## Results — grade-local, final config (S6d)

```
net PnL   -0.055573022 SOL  (return -0.56%, 90% interval -0.219 .. +0.116 SOL)
top coins 3 coins made 41% of the gains; without them net PnL is -0.19 SOL
trading   222 fills over 111 coins, 111 round trips, win rate 26.1%,
          max drawdown 0.0104, 1 rejected, 2 failed
fees      0.107861388 SOL curve + 0.023520000 SOL tx;
          at 2x fees net PnL -0.185246854 SOL
guardrails met (111 coins hold a round trip of at least 0.010000000 SOL,
          over 111 such round trips, drawdown ok)
action_log_sha256 bb7e7d69090356a7391fefd79cb5679c87b3ff2d34713d3187699a958c6cd897
result_sha256     3e9fe75d72fd02d62753eebabf973c8834aa74082eabff44e877bdf393bf664f
```

Local determinism: L1 regrade reproduced the action log byte-for-byte (L1=True) on every sweep run; the final config's action log is bb7e7d690903… (full hash in the sweep log).

## Results — `--stress 20`

20 block surrogates rebuilt from the dev window's own trades (each a full
24 h replay), graded with `--driver process --worktree`:

```
stress    20 block surrogates of the dev window: median -0.07, p10 -0.18,
          p90 +0.03 SOL; 3 of 20 positive, 17 of 20 negative; mean -0.08
```

Per-copy net PnL (SOL): −0.15, +0.03, −0.07, −0.02, +0.03, −0.13, +0.05,
−0.07, −0.16, −0.18, −0.14, −0.25, −0.06, −0.05, −0.02, −0.04, −0.09,
−0.04, −0.09, −0.15. Best +0.05, worst −0.25.

Reading: the dev score (−0.056) sits just above the stress median (−0.07),
so the dev window was not a particularly kind draw and selection bias is
mild — a sharp contrast with v1, whose dev score (−0.30) beat all 20 of its
stress copies (median −0.72). Scaled to the final 6 h window (mean ∝ time,
sd ∝ √time: mean ≈ −0.02, sd ≈ 0.035 SOL), the chance of landing above
zero is roughly one in four — better than v1's roughly one in five, but
still a loss more often than not.

## Honest assessment

**No tested approach reaches a positive dev PnL.** Three genuinely different families were tried on the official harness: dip-buying (v1, −0.298), tape-filtered scalping (v2, best −0.0556), and early-momentum buying of very young coins (−0.326…−0.356). Within the scalper family, ~20 configurations were swept; the best (−0.0556) is a local optimum in a flat region, and every neighbouring change is worse. The sibling strategy that motivated v2 is itself ~breakeven on this data (−0.0035 on this kit's harness, +0.010 on its own kit — the difference is tx-failure-seed noise, and its 90% interval spans −0.15…+0.17 SOL).

Why nothing is positive: the gross edge of the best filter is ≈ +0.076 SOL / 24 h and the fee wedge is ≈ 0.131 SOL / 24 h. The signal (a 60-slot rise with real inflow and several distinct buyers) is real but weak — it lifts the win rate to ~26–32% and the gross edge slightly above zero, but not by enough to clear ~3.2% per round trip in fees. The pullback variant looked closest on a per-trip basis (−0.0048 over 5 trips) but cannot meet the ≥20-coin guardrail, so it is not submittable. The early-momentum family is decisively the worst: most new coins die within minutes and no buy-pressure filter saves them.

**Recommendation: do not submit v2 as a prize-winning entry.** Per the task brief, a negative strategy must not be force-submitted. v2 is strictly better than v1 (−0.0556 vs −0.298 dev, and its round-2 score would be expected near −0.056 rather than −0.298), so if the user decides to take the shot anyway — e.g. because the field is mostly negative and a −0.056 bot can still rank near the top on a lucky 6 h draw — it is the best available entry. But the honest expectation is a loss: the dev 90% interval reaches only +0.116 SOL, the stress test puts 17 of 20 rebuilt windows negative, and the final 6 h window is a fresh draw on unseen coins. The stress-implied chance of a positive final score is roughly one in four.

## Risks

- **Dev-window overfit:** all parameters were selected on one 24 h window; the final 6 h window is a fresh regime. The final config was deliberately kept in a flat region rather than at a sharp optimum, but selection bias remains.
- **Guardrail on a quiet window:** ~111 trips / 24 h implies ~28 expected trips in the final 6 h — comfortably above 20, but a much quieter window could still threaten it (the pace fallback is the mitigation; it kept trips at 111 vs 91 strict-only).
- **Fee sensitivity:** at 2× fees the dev result is −0.185 SOL. The final window's fee regime is the same as dev (95 + 30 bps).
- **Top-3 concentration:** 41% of gains come from 3 coins; without them −0.19 SOL. The bot needs to catch 2–3 good runners per window.
- **Node version:** local Node is v24.22.1, the server harness runs v26.13.1 (per the grade-local note, result_sha256 cannot equal the server's for this reason); behaviour is deterministic in both.
- **The 35-coin replication gap:** v2 buys 35 coins the sibling does not (all passing with wide margins). If the final window's tape timing differs, the trip count could shift by a similar amount in either direction; the guardrail margin (~28 expected vs 20 required) absorbs a moderate shift.

## Notes for the tester / submitter

- `main.ts` runs `await runBot(createBot())` — defaults are the final config in `strategy.ts` (`DEFAULT_PARAMS`).
- `strategy.ts` is a complete rewrite for v2 (Flow Scalper); no v1 dip logic remains. `vendor/makefun-bot.ts` is the kit SDK shim copied verbatim and is excluded from authorship counts per its own header.
- Sweep log (every config + action-log hash): `/tmp/sweep-log.csv` (ephemeral; the table above is the durable copy).
- Execution-risk notice: this build ran under the user's explicit approval of 27 Nov 2026 14:34 WIB, including execution-risk holds for build/grade commands in this repo.
