// Dip Hunter — pump.fun replay bot (agent-fun/replay/v2).
// Entrypoint: the harness runs `node /bot/main.ts` and speaks the protocol
// on stdin/stdout. The strategy lives in strategy.ts; this file only wires
// it to the kit's protocol shim. No dependencies, no network, no secrets.

import { runBot } from './vendor/makefun-bot.ts';
import { createBot } from './strategy.ts';

await runBot(createBot());
