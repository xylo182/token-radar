// Token Radar model, radar-2: a fitted power law, not a guessed multiple.
//
// The board ranks pre-token protocols by the expected value of a future token
// launch. The value is fitted from the snapshot itself, at run time, on the
// tokenized peers the snapshot carries:
//
//   value_if_launched = 10^a x TVL^b x growthMult x maturityMult
//   implied_value_usd = round(value_if_launched x issuance_odds)
//
//   a, b      fitted by ordinary least squares on log10(mcap) ~ log10(TVL)
//             over the snapshot's tokenized protocols with a positive mcap
//             (128 peers here). The fit is done in the program, from the
//             snapshot it reads, so the same bytes always give the same fit.
//   growth    = clamp(change_7d, -60, 120); growthMult = 1 + growth/100 x 0.5
//   maturity  = 0.6 + min(age_days, 1095)/1095 x 0.4 (age unknown: 365 days)
//   odds      = the category's token-issuance share among the snapshot's
//             protocols, shrunk toward the global share with a pseudo-count
//             of 5: (tokenized_in_category + 5 x global) / (all_in_category + 5)
//
// Why a power law: the peers' market caps grow sublinearly with TVL. Held out
// twice (the peers split by slug, fit on one half, tested on the other), the
// power law's median |log10 error| on a peer's mcap is 0.48 and 0.55, against
// 0.71 and 0.70 for the starter's flat 0.25 x TVL multiple on the same halves.
// A category-median ratio was tried and did not help (0.51 and 0.56), so it is
// not in the model; neither is any list of names. The odds term is not part
// of the held-out test: every peer in it already has a token, so odds would
// only shrink its prediction. The program prints the held-out numbers.
//
// Nothing here is a prediction of whether or when a token is issued: the
// implied value is this entry's own claim, and a protocol the snapshot says
// records no token is written as recording no token, never as having none.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The fitted model's constants, as the dashboard states them. */
export interface ModelConstants {
  version: string;
  peers: number;
  intercept: number;
  slope: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  global_odds: number;
  odds_pseudo: number;
  global_median_ratio: number;
}

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One held-out split's result, fitted on one half and tested on the other. */
export interface HeldOutResult {
  split: string;
  peers_tested: number;
  fitted_median_log10_error: number;
  starter_median_log10_error: number;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  value_if_launched_usd: number;
  issuance_odds: number;
  model: {
    intercept: number;
    slope: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  value_if_launched_usd: number;
  issuance_odds: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One category's fitted figures, for the dashboard's fit table. */
export interface CategoryFit {
  category: string;
  protocols: number;
  tokenized: number;
  odds: number;
  peers: number;
  median_ratio: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  watchlist: string[];
  board_size: number;
  live_size: number;
  held_out: HeldOutResult[];
  categories: CategoryFit[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list. */
export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/**
 * The house's watchlist rule, applied to the whole board, not only the
 * watchlist: a wrapped, staked or bridged product of a protocol whose token
 * already trades is not a token that does not exist yet. WBTC is Bitcoin on
 * Ethereum and Binance staked ETH is ETH in a staking product — ranking them
 * as launches of their own would be the board's first lie. The categories,
 * the whole words and the exchange names are the rule the snapshot's
 * watchlist was drawn with.
 */
const WRAPPED_CATEGORY = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Whether a protocol is one the board may rank: pre-token and not a wrapped, staked or bridged product of one that trades. */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !WRAPPED_CATEGORY.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name) &&
    !WRAPPED_WORD.test(p.name)
  );
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/**
 * Ordinary least squares for y = a + b*x, on two equal-length lists.
 * The fit is over log10 values, so the result is the power law's constants.
 */
export function ols(xs: number[], ys: number[]): { intercept: number; slope: number } {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
    sxy += (xs[i]! - mx) * (ys[i]! - my);
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  return { intercept: my - slope * mx, slope };
}

/** The starter's flat multiple, for the held-out comparison only. */
function starterValue(p: SnapshotProtocol, asOf: string): number {
  const growth = Math.min(120, Math.max(-60, finite(p.change_7d, 0)));
  const growthMult = 1 + (growth / 100) * 0.5;
  const age = ageDays(asOf, p.listed_at) ?? 365;
  const maturityMult = 0.6 + (Math.min(Math.max(age, 0), 1095) / 1095) * 0.4;
  return Math.max(1, p.tvl_usd * 0.25 * growthMult * maturityMult);
}

/**
 * Fit the power law on a set of peers and test it, with the starter, on another
 * set. Returns the fitted constants and the median |log10 error| of each model.
 */
export function fitAndTest(
  train: SnapshotProtocol[],
  test: SnapshotProtocol[],
  asOf: string,
): { intercept: number; slope: number; fittedError: number; starterError: number } {
  const { intercept, slope } = ols(
    train.map((p) => Math.log10(p.tvl_usd)),
    train.map((p) => Math.log10(p.mcap_usd!)),
  );
  const fittedErrors: number[] = [];
  const starterErrors: number[] = [];
  for (const p of test) {
    const age = ageDays(asOf, p.listed_at) ?? 365;
    const growth = Math.min(120, Math.max(-60, finite(p.change_7d, 0)));
    const growthMult = 1 + (growth / 100) * 0.5;
    const maturityMult = 0.6 + (Math.min(Math.max(age, 0), 1095) / 1095) * 0.4;
    const pred = 10 ** intercept * p.tvl_usd ** slope * growthMult * maturityMult;
    fittedErrors.push(Math.abs(Math.log10(pred / p.mcap_usd!)));
    starterErrors.push(Math.abs(Math.log10(starterValue(p, asOf) / p.mcap_usd!)));
  }
  return { intercept, slope, fittedError: median(fittedErrors), starterError: median(starterErrors) };
}

/** The fitted model: constants, odds table and held-out results, all from the snapshot. */
export interface FittedModel {
  constants: ModelConstants;
  heldOut: HeldOutResult[];
  categories: CategoryFit[];
  oddsFor: (category: string | null) => number;
  valueIfLaunched: (p: SnapshotProtocol) => { value: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null };
}

/** Fit the model on the snapshot's tokenized peers, and test it held out twice. */
export function fitModel(snapshot: Snapshot): FittedModel {
  const peers = snapshot.protocols
    .filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0)
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  if (peers.length < 10) throw new SnapshotError(`only ${peers.length} tokenized peers carry a market cap: the power law has nothing to fit on`);
  const full = ols(
    peers.map((p) => Math.log10(p.tvl_usd)),
    peers.map((p) => Math.log10(p.mcap_usd!)),
  );
  const even = peers.filter((_, i) => i % 2 === 0);
  const odd = peers.filter((_, i) => i % 2 === 1);
  const splitA = fitAndTest(odd, even, snapshot.as_of);
  const splitB = fitAndTest(even, odd, snapshot.as_of);
  const heldOut: HeldOutResult[] = [
    { split: 'A (fit odd slugs, test even)', peers_tested: even.length, fitted_median_log10_error: round4(splitA.fittedError), starter_median_log10_error: round4(splitA.starterError) },
    { split: 'B (fit even slugs, test odd)', peers_tested: odd.length, fitted_median_log10_error: round4(splitB.fittedError), starter_median_log10_error: round4(splitB.starterError) },
  ];

  const globalOdds = snapshot.protocols.filter((p) => !isPreToken(p)).length / snapshot.protocols.length;
  const byCategory = new Map<string, { total: number; tokenized: number; ratios: number[] }>();
  for (const p of snapshot.protocols) {
    const c = p.category ?? '(no category)';
    const row = byCategory.get(c) ?? { total: 0, tokenized: 0, ratios: [] };
    row.total += 1;
    if (!isPreToken(p)) row.tokenized += 1;
    if (!isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0) row.ratios.push(p.mcap_usd / p.tvl_usd);
    byCategory.set(c, row);
  }
  const categories: CategoryFit[] = [...byCategory.entries()]
    .map(([category, v]) => ({
      category,
      protocols: v.total,
      tokenized: v.tokenized,
      odds: round4((v.tokenized + 5 * globalOdds) / (v.total + 5)),
      peers: v.ratios.length,
      median_ratio: v.ratios.length > 0 ? round4(median(v.ratios)) : null,
    }))
    .sort((a, b) => b.protocols - a.protocols);
  const oddsMap = new Map(categories.map((c) => [c.category, c.odds]));

  const constants: ModelConstants = {
    version: MODEL_VERSION,
    peers: peers.length,
    intercept: round4(full.intercept),
    slope: round4(full.slope),
    growth_weight: 0.5,
    growth_floor: -60,
    growth_cap: 120,
    maturity_floor: 0.6,
    maturity_range: 0.4,
    maturity_days: 1095,
    unknown_age_days: 365,
    global_odds: round4(globalOdds),
    odds_pseudo: 5,
    global_median_ratio: round4(median(peers.map((p) => p.mcap_usd! / p.tvl_usd))),
  };

  const valueIfLaunched = (p: SnapshotProtocol) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const growthPct = Math.min(120, Math.max(-60, finite(p.change_7d, 0)));
    const growthMult = 1 + (growthPct / 100) * 0.5;
    const ageForModel = age ?? 365;
    const maturityMult = 0.6 + (Math.min(Math.max(ageForModel, 0), 1095) / 1095) * 0.4;
    const value = Math.max(1, 10 ** full.intercept * p.tvl_usd ** full.slope * growthMult * maturityMult);
    return { value, growthPct, growthMult, maturityMult, age };
  };

  return {
    constants,
    heldOut,
    categories,
    oddsFor: (category) => oddsMap.get(category ?? '(no category)') ?? globalOdds,
    valueIfLaunched,
  };
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** What one transaction costs on a chain, in whole dollars, from the chain's own fee level. */
function gasUsd(chain: string): number {
  const c = chain.toLowerCase();
  if (c === 'solana') return 0.05;
  if (c === 'polygon') return 0.1;
  if (c.includes('binance') || c === 'bsc' || c === 'avalanche') return 0.3;
  if (c === 'arbitrum') return 0.4;
  if (c === 'base' || c === 'optimism' || c === 'linea' || c === 'scroll' || c === 'blast' || c === 'mode') return 0.5;
  if (c.includes('zksync')) return 0.5;
  if (c === 'ethereum') return 8;
  return 2;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's main action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's weekly qualifying action, so the position stays active. */
function weeklyFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow a small amount against the deposit on ${name} once a week, then repay it.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Swap $10 through ${name}'s main pool on ${chain} once a week.`;
  if (c.includes('bridge')) return `Use the bridged funds inside ${name}'s app once a week.`;
  if (c.includes('staking') || c.includes('restak')) return `Restake the week's rewards through ${name} once a week.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Adjust the hedge on ${name} once a week so the position stays live.`;
  if (c.includes('prediction')) return `Place one small market position on ${name} once a week.`;
  if (c.includes('curator') || c.includes('allocator')) return `Check ${name}'s vault rebalance once a week and keep the shares.`;
  if (c.includes('stable')) return `Top up the stable position on ${name} by $10 once a week.`;
  if (c.includes('rwa')) return `Claim the week's yield from ${name} once a week and keep the receipt.`;
  if (c.includes('insurance')) return `Check the policy on ${name} once a week and keep it active.`;
  return `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time.
 * Every figure is derived from the protocol's own record (category, chains,
 * TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const gas = gasUsd(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gasText = gas < 1 ? `$${gas.toFixed(2)}` : `$${gas}`;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: `about ${gasText} of gas for the first transaction on ${chain}`,
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about ${gasText} of gas on ${chain}`,
      time: '15 minutes to set up',
    },
    {
      text: weeklyFor(p, chain),
      cost: `about ${gasText} of gas a week on ${chain}`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: FittedModel): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, not only the
  // biggest: the board ranks the whole pre-token universe the snapshot holds.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }
  const scored = [...chosen.values()].map((p) => {
    const { value, growthPct, growthMult, maturityMult, age } = model.valueIfLaunched(p);
    const odds = model.oddsFor(p.category);
    return { p, value, odds, implied: Math.max(1, Math.round(value * odds)), growthPct, growthMult, maturityMult, age };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    value_if_launched_usd: Math.round(s.value),
    issuance_odds: round4(s.odds),
    model: {
      intercept: model.constants.intercept,
      slope: model.constants.slope,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    value_if_launched_usd: row.value_if_launched_usd,
    issuance_odds: row.issuance_odds,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData; model: FittedModel } {
  const model = fitModel(snapshot);
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: model.constants,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    watchlist: snapshot.watchlist,
    board_size: board.length,
    live_size: live.length,
    held_out: model.heldOut,
    categories: model.categories,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar, model };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
