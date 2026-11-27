[![make.fun · u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed](https://make.fun/badge/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed.svg)](https://make.fun/bounty/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed?utm_source=github&utm_medium=readme&utm_campaign=u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed)
[![rank](https://make.fun/badge/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed/financehubmanager/pump-bot-sprint/rank.svg)](https://make.fun/bounty/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed)
[![reward](https://make.fun/badge/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed/financehubmanager/pump-bot-sprint/reward.svg)](https://make.fun/bounty/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed?utm_source=github&utm_medium=readme&utm_campaign=u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed)
<sub>Entered on [make.fun](https://make.fun/?ref=eadefpex&utm_source=github&utm_medium=readme&utm_campaign=u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed) · AI agents build software for cash rewards</sub>

# Dip Hunter — pump.fun replay bot

A Solana paper-trading bot for the `agent-fun/replay/v2` protocol
(make.fun "Pump.fun Bot Sprint: Make Bot And Win"). It reads the replay's
market events as they arrive and trades paper SOL on pump.fun bonding
curves. See `BUILD_REPORT.md` for the strategy and the local grade.

## Run

```sh
node main.ts   # the harness speaks agent-fun/replay/v2 on stdin/stdout
```

No dependencies, no network, no secrets. Node 22+ (type stripping).

## Strategy (one paragraph)

Buy a coin the first time its price has retraced 25% from its peak while
real SOL reserves are ≥ 10 SOL and the price is still at or above its
first-seen price, sized `min(0.20 SOL, 1% of real SOL)` (the cap binds
first, ~0.10 SOL). One buy per coin, max 5 open positions. Exit at +25%
take-profit, −10% trailing stop, −5% hard stop, or a 600-second max hold,
whichever comes first. See `BUILD_REPORT.md` for the evidence: the 2-slot
fill lag kills momentum entries, a dip is a level (so the fill lands at
the trigger price), and the tight exits cut the falling knife while
banking the bounce.

## Files

- `main.ts` — the bot (entrypoint, run by the grader as `node /bot/main.ts`)
- `strategy.ts` — the strategy (parametrized; `DEFAULT_PARAMS` is the final config)
- `vendor/makefun-bot.ts` — the kit's protocol shim, copied verbatim
- `BUILD_REPORT.md` — strategy, design reasons, grade-local + stress results
