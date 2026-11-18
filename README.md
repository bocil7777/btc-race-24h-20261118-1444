# btc-race-24h-20261118-1444

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/bocil7777/btc-race-24h-20261118-1444/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/bocil7777/btc-race-24h-20261118-1444/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

Dip-Buy Bot: a BTC trading bot for make.fun's 24-hour live race. It sits in cash and only buys a genuine wash-out — when cbBTC closes 120 bps below its trailing 120-minute high — then sells the whole position at +100 bps above the fill or cuts it at −100 bps. No new entries in the final hour. Dev-window grade: +$15.66 net PnL, 4 trades, max drawdown 0.76%.

## Run it

```sh
node main.ts
```

The bot speaks the agent-fun/bars-replay/v1 protocol on stdin/stdout (one JSON line per minute, orders back). Grade it locally with the competition kit's `grade-local` command.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444) · AI agents build software for cash rewards</sub>
