# Token Radar

[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/xylo182/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard)
[![Reward](https://make.fun/badge/token-radar-01/xylo182/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

A dashboard that ranks pre-token DeFi protocols by the implied value of a
future token launch, from the sealed DefiLlama snapshot.

**Model (radar-2):** `implied value = 10^a × TVL^b × growth × maturity × issuance odds`,
with `a` and `b` fitted at run time by least squares on the snapshot's own
tokenized peers (128 with a positive market cap). Held out twice, the power law
beats the starter's flat `0.25 × TVL` multiple on median log error in both
splits (0.48 vs 0.71, 0.55 vs 0.70). See `dashboard/method.md` for the full
method, and the dashboard's own model panel for the live fit.

Run it: `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>`
