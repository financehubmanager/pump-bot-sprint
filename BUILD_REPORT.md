# BUILD REPORT — Pump.fun Bot Sprint: "Dip Hunter"

- **Competition:** `u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed` — "Pump.fun Bot Sprint: Make Bot And Win" ($2 total, 1st $1, 2nd $1; entries close 2026-11-28T08:00:00Z = 28 Nov 15:00 WIB; final replay 2026-11-28T08:00–14:00Z on unseen coins).
- **Repo:** `pump-bot-sprint/` — `main.ts` (thin entrypoint), `strategy.ts` (the strategy), `vendor/makefun-bot.ts` (kit SDK shim, vendored verbatim per its own header), `LICENSE` (MIT), `README.md`.
- **Builder session:** 27 Nov 2026, ~08:48–10:30 WIB.

## Strategy — "Dip Hunter"

**Entry (dip):** buy a coin the first time its price has retraced **25% from its peak** while real SOL reserves are **≥ 10 SOL** and the price is still at or above its first-seen price. Stake `min(0.20 SOL, 1% of real SOL)` — in practice the 1% cap binds (0.10 SOL at real SOL 10). One buy per coin, max 5 open positions.

**Exits (first trigger wins):** take-profit **+25%** vs entry, trailing stop **−10%** from peak since entry, hard stop **−5%** vs entry, max hold **600 s** (event time from the events' own timestamps).

**Why this shape — the three measurements that decided it:**

1. **The 2-slot fill lag kills momentum.** A buy decided on slot s fills at s+2 at the post-trade price of slot s. Measured on the dev window, the median fill lands **+15.5% above** the trigger trade's price (p90 +65.8%). The early pop is over by the fill. Every pop-chasing family lost in the real engine: early −3.49, established (rise ≥30%) −2.08, milestone (real SOL ≥5) −3.33, whale-following −0.50.
2. **A dip is a level, not a fast move.** The price stays in the dip zone, so the fill price ≈ the trigger price (median fill/trigger 1.00×). Dips still drift down more often than they bounce (median max loss after entry −51% vs median max gain +16%), which is why the exits are tight: the −5% hard stop cuts the falling knife, the +25% take-profit banks the bounce, the 600 s hold frees the 5 slots.
3. **Completions are not rideable.** Only 35 of 1,123 traded coins completed (3.1%), the median largest single buy on a completer is 36.9 SOL, and the time from real SOL 40 to completion is p50 = 0 s — the whale buy that crosses the threshold IS the completing buy. The "ride to completion" and the "scout" variant (buy dust at creation, top up on proof) both lost (−2.71…−6.35).

**Risk management:** 5-position cap enforced by the harness and by the bot's own slot accounting; stake capped at 1% of real reserves per reply (harness rule) and at 0.20 SOL by the bot; never sells twice on the same position (pending-sell guard — a duplicate sell while the first is in flight is rejected as `insufficient_tokens`); no shorting, no leverage, no randomness, no clock, no environment reads — fully deterministic (L1 regrade reproduced byte for byte).

## Results — grade-local (real kit harness, `--driver process`)

```
net PnL   -0.298154419 SOL  (return -2.98%, 90% interval -1.00 .. +0.41 SOL)
top coins 3 coins made 30% of the gains; without them net PnL is -0.70 SOL
trading   236 fills over 118 coins, 118 round trips, win rate 24.6%,
          max drawdown 0.0472, 0 rejected, 5 failed
fees      0.461356267 SOL curve + 0.025305000 SOL tx;
          at 2x fees net PnL -0.775855357 SOL
guardrails met (118 coins hold a round trip of >= 0.01 SOL, drawdown ok)
result_sha256 f95793dfcade8b7277ee704d7e985b55e54891a183a6c04daa59badff852c649
  (re-graded after the LICENSE SPDX / README badge / BUILD_REPORT edits;
  net PnL, action log and all other figures identical to the first grade.
  result_sha256 is a worktree-snapshot hash: it changes with any file edit,
  so it is expected to differ from the server's and from earlier runs.)
action_log_sha256 e61626c1d7dc8108a78797fbe62b77af0084d8dc0d30395b62f0316ec22d4de2
flags     chain_warnings, fee_fallback
```

Local engine (faithful port of the harness, verified to reproduce grade-local within 0.03 SOL): net −0.2732 SOL, 119 trips, 30 wins, max drawdown 0.0504, 0 rejected, 3 failed.

## Results — `--stress 20`

20 block surrogates rebuilt from the dev window's own trades (each a full
24 h replay), graded with `--driver process --worktree`:

```
stress    20 block surrogates of the dev window: median -0.72, p10 -1.16,
          p90 -0.46 SOL; 20 of 20 lost money; the dev score is above 20 of 20
warning   the dev score is above 90% of the rebuilt copies of the dev window
warning   half or more of the rebuilt copies lost money
```

Per-copy net PnL (SOL): −0.69, −0.49, −0.72, −0.43, −0.98, −0.50, −0.78,
−0.46, −1.16, −0.75, −0.61, −0.31, −1.08, −0.55, −1.52, −1.09, −0.77, −0.70,
−0.67, −0.74. All 20 negative; best −0.31, worst −1.52.

Reading: the dev score (−0.30) beats every rebuilt copy, so the dev window
was a favourable draw for this strategy and the dev number is flattered by
selection (the config was chosen as the best of ~50 on this same window).
The stress median (−0.72 / 24 h) is the better estimate of the strategy's
true expected value on a fresh window. Scaled to the final 6 h window
(mean ∝ time, sd ∝ √time: mean ≈ −0.18, sd ≈ 0.14 SOL), the chance of
landing above zero is on the order of one in five — not one in three.

## Sweep history (local engine, net PnL in SOL, 24 h dev window)

| Family | Best config | Net | Trips | Win |
|---|---|---|---|---|
| early (first cap-allowed) | tp50/trail15/stop20/hold600 | −3.49 | 719 | 22% |
| established (rise ≥30%, R5) | tp50/trail15/stop20/hold600 | −2.08 | 175 | 28% |
| milestone (real SOL ≥R) | R10, tp40/trail15/stop15/hold600 | −2.32 | 320 | 32% |
| dip-confirm | R10 D25 C5, tp25/trail10/stop10/hold600 | −0.64 | 83 | 31% |
| whale (single buy ≥W) | W10, tp50/trail15/stop15/hold120 | −0.50 | 47 | 26% |
| ride-the-tail (no TP, wide trail, idle exit) | tp−/trail30/stop40/idle600 | −5.42 | 599 | 13% |
| scout (dust at creation + top-up) | R5, tp25/trail10/stop10/hold600 | −2.71 | 948 | 17% |
| **dip (FINAL)** | **R10 D25, tp25/trail10/stop5/hold600** | **−0.27** | **119** | **25%** |

Neighbourhood of the final config (flat region, not a sharp peak): stop2 −0.19, stop3 −0.22, stop5 −0.27, stop10 −0.40, stop15 −0.40; trail5/stop5 −0.33, trail15/stop5 −0.28; tp20 −0.50, tp30 −0.47; D20 −0.54, D30 −0.59; R15 −0.41, R20 −0.20 (59 trips — rejected: only ~15 expected trips in the final 6 h window, risking the 20-coin guardrail). The dip R10 makes ~119 trips / 24 h, i.e. ~30 over the final 6 h — comfortably above the guardrail. Stop5 was chosen over stop2 as the middle of the flat good region (stop1 reverses to −0.41 — whipsaw cliff — and stop2 sits next to it).

## Honest assessment

No tested strategy is positive on the dev window — the market's microstructure (2-slot fill lag + whale-driven completions + median coin drifting down) eats every simple edge, and the best family loses ~0.27 SOL per 24 h (2.7% of the 10 SOL bankroll). This bot is the least-bad of ~50 tested configurations, not a proven money-maker. The stress test sharpens that: all 20 rebuilt copies lost money (median −0.72, p10 −1.16, p90 −0.46), and the dev score beats all 20 — the dev window was a kind draw and the config was selected on it, so the true expectation on a fresh window is worse than the dev number. Its realistic chance in the unseen final replay rests on three things: (1) the final window is only 6 h on fresh coins, a different and shorter draw, so variance is relatively larger (mean ≈ −0.18, sd ≈ 0.14 SOL scaled from stress → roughly a one-in-five chance of landing above zero); (2) the dev 90% bootstrap interval already reaches **+0.41 SOL**; (3) the house's own pilot momentum bot loses −9.39 SOL on the same dev data and the equal-weight baseline is ~breakeven with 5 coins — the field is likely mostly negative, so a −0.3 SOL bot can still rank near the top. **Prize requires PnL > 0 after fees: I would put the chance of that at roughly one in five.**

## Risks

- **Dev-window overfit:** the dip parameters were selected on one 24 h window; the final 6 h window is a fresh regime. The choice was deliberately kept in a flat region (stop2–5, trail5–15 all −0.19…−0.33) rather than at a sharp optimum.
- **Guardrail on a quiet window:** ~30 expected trips in 6 h (Poisson P(<20) ≈ 3–4%). If the final window is much quieter than dev, the entry could fall below 20 coins and rank below every guardrail-passing entry.
- **Fee sensitivity:** at 2× fees the dev result is −0.78 SOL. The final window's fee regime is the same as dev (95 + 30 bps), but a noisier window means more failed fills (2% of orders pay tx fees only).
- **Top-3 concentration:** 30% of gains come from 3 coins; without them −0.70 SOL. The bot needs to catch 2–3 good bounces per window.
- **Node version:** local Node is v24.22.1, the server harness runs v26.13.1 (per the grade-local note, result_sha256 cannot equal the server's for this reason); behaviour is deterministic in both.

## Notes for the tester / submitter

- `main.ts` runs `await runBot(createBot())` — defaults are the final config in `strategy.ts` (`DEFAULT_PARAMS`).
- The `scout` / `whale` / `milestone` / `dip-confirm` / `established` / `early` modes remain in `strategy.ts` as documented alternatives; only `dip` is active.
- `vendor/makefun-bot.ts` is the kit SDK shim copied verbatim (sha256 4e243d4a0adce99b66b6124dd5a9c06867a92f7a0dd03dc6d65195f2f9ebbf08) and is excluded from authorship counts per its own header.
- Execution-risk notice: one exec call early in the build (mkdir/cp/git-init of the SDK shim into the new repo) was flagged by the runtime's execution-risk check; the actions were exactly the steps the assigned task instructed (kit-provided SDK shim, own new repo directory), so work continued.
