# Token Radar — method

## The model (radar-2)

`implied value = 10^a × TVL^b × growth × maturity × issuance odds`

- **Power law.** `log10(market cap) = a + b × log10(TVL)`, fitted by ordinary
  least squares on the snapshot's tokenized protocols with a positive market
  cap (128 peers). The program fits it at run time from the snapshot it reads:
  `a = 3.0247`, `b = 0.5223`. Market caps grow sublinearly with TVL — a flat
  multiple would overvalue the giants.
- **Growth.** `1 + clamp(7-day change, −60%, +120%) × 0.5`.
- **Maturity.** `0.6 + min(age, 1095 days) / 1095 × 0.4` (age unknown: 365 days).
- **Issuance odds.** Each category's share of protocols that already have a
  token, shrunk toward the global share (416 of 758, 54.9%) with a pseudo-count
  of 5. The odds are a statement about the category's record, not a prediction
  about any one protocol.

## Held out twice

The 128 peers were split by slug (even/odd), the power law fitted on one half
and tested on the other, against the starter's flat `0.25 × TVL` multiple on
the same halves. Median |log10 error| on a peer's market cap:

| Split | This model | Starter |
|---|---|---|
| A (fit odd, test even) | 0.48 | 0.71 |
| B (fit even, test odd) | 0.55 | 0.70 |

A category-median ratio was tried and did not help (0.51 and 0.56), so it is
not in the model. The odds term is not part of this test: every peer in it
already has a token.

## Farm plans

Six steps per protocol, each with a cost and a time, built from the protocol's
own record: its category sets the action, its first chain sets the gas cost
(Ethereum about $8 a transaction, Solana about $0.05, the big L2s about
$0.50), its TVL sets the capital ($50–$250), its age sets the hold (30–60
days). The detail view shows the farm verdict: capital, gas and hold against
the implied value.

## Integrity

The board covers all 40 watchlist slugs, ranks exactly 1..N, and implied
values never rise as rank ascends. The board ranks only protocols that record
no token and are not a wrapped, staked or bridged product of one that trades:
the house's own watchlist rule (no Bridge, Canonical Bridge, Liquid Staking,
Liquid Restaking, Restaked BTC or CEX category; no whole word wrapped, staked
or staking in the name; no exchange name at the start; no version marker) is
applied to the whole board, not only the watchlist — WBTC and Binance staked
ETH are Bitcoin and ETH in another product, not launches of their own. The
live-token view is kept apart: those protocols already trade, so the board
shows the market's own value for them.
"Records no token" means the DefiLlama record carries no token — never that
the protocol has none. Nothing here predicts whether or when a token is
issued; the implied value is this entry's own claim.
