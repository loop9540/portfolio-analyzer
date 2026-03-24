import { AnalysisResult } from "./analyze";
import { HoldingsData, parseOptionHolding } from "./parseHoldings";

export interface CombinedTickerPnL {
  ticker: string;
  holding: string;
  currentShares: number;
  currentPrice: number;
  avgCost: number;
  bookValue: number;
  marketValue: number;
  unrealizedGL: number;
  premiumCollected: number;
  truePnL: number;
  truePnLPct: number;
  hasOpenCall: boolean;
  openCallDetails: string | null;
  hasOpenPut: boolean;
  openPutDetails: string | null;
  canSellCalls: boolean;
}

export interface CombinedAnalysis {
  tickers: CombinedTickerPnL[];
  totalPortfolioValue: number;
  totalUnrealizedGL: number;
  totalPremiumCollected: number;
  totalTruePnL: number;
  totalFees: number;
  totalDividends: number;
  totalNetIncome: number;
  cashAndTBills: number;
  putExposure: number;
  tickersWithOpenCalls: number;
  tickersEligibleForCalls: number;
  coverageRatio: number;
  capitalEfficiency: number;
}

export function analyzeCombined(
  activities: AnalysisResult,
  holdings: HoldingsData
): CombinedAnalysis {
  // Parse open options from holdings
  const openOptions: Record<
    string,
    { calls: ReturnType<typeof parseOptionHolding>[]; puts: ReturnType<typeof parseOptionHolding>[] }
  > = {};

  for (const opt of holdings.options) {
    const parsed = parseOptionHolding(opt);
    if (!parsed) continue;
    if (!openOptions[parsed.ticker]) {
      openOptions[parsed.ticker] = { calls: [], puts: [] };
    }
    if (parsed.type === "CALL" && parsed.isSold) {
      openOptions[parsed.ticker].calls.push(parsed);
    } else if (parsed.type === "PUT" && parsed.isSold) {
      openOptions[parsed.ticker].puts.push(parsed);
    }
  }

  // Build per-ticker combined data
  const tickerMap = new Map<string, CombinedTickerPnL>();

  // Start with equities from holdings
  for (const eq of holdings.equities) {
    const ticker = eq.symbol.trim().toUpperCase();
    const premium = activities.premiumByTicker[ticker];
    const netPremium = premium ? premium.sold - premium.bought : 0;
    const opts = openOptions[ticker];
    const hasOpenCall = !!opts?.calls.length;
    const hasOpenPut = !!opts?.puts.length;

    const truePnL = eq.gl + netPremium;
    const truePnLPct = eq.bookValue !== 0 ? (truePnL / eq.bookValue) * 100 : 0;

    tickerMap.set(ticker, {
      ticker,
      holding: eq.holding,
      currentShares: eq.quantity,
      currentPrice: eq.price,
      avgCost: eq.averageCost,
      bookValue: eq.bookValue,
      marketValue: eq.marketValue,
      unrealizedGL: eq.gl,
      premiumCollected: netPremium,
      truePnL,
      truePnLPct,
      hasOpenCall,
      openCallDetails: hasOpenCall
        ? opts!.calls
            .map(
              (c) =>
                `${c!.contracts}x $${c!.strike} ${c!.expiry}`
            )
            .join(", ")
        : null,
      hasOpenPut,
      openPutDetails: hasOpenPut
        ? opts!.puts
            .map(
              (p) =>
                `${p!.contracts}x $${p!.strike} ${p!.expiry}`
            )
            .join(", ")
        : null,
      canSellCalls: eq.quantity >= 100 && !hasOpenCall,
    });
  }

  // Add tickers from activities that aren't in holdings (fully exited positions)
  for (const [ticker, prem] of Object.entries(activities.premiumByTicker)) {
    if (!tickerMap.has(ticker)) {
      const netPremium = prem.sold - prem.bought;
      tickerMap.set(ticker, {
        ticker,
        holding: `${ticker} (exited)`,
        currentShares: 0,
        currentPrice: 0,
        avgCost: 0,
        bookValue: 0,
        marketValue: 0,
        unrealizedGL: 0,
        premiumCollected: netPremium,
        truePnL: netPremium,
        truePnLPct: 0,
        hasOpenCall: false,
        openCallDetails: null,
        hasOpenPut: false,
        openPutDetails: null,
        canSellCalls: false,
      });
    }
  }

  const tickers = Array.from(tickerMap.values()).sort(
    (a, b) => b.truePnL - a.truePnL
  );

  // Aggregates
  const totalPortfolioValue = holdings.totalMarketValue;
  const totalUnrealizedGL = tickers.reduce((s, t) => s + t.unrealizedGL, 0);
  const totalPremiumCollected = tickers.reduce(
    (s, t) => s + t.premiumCollected,
    0
  );
  const totalTruePnL = tickers.reduce((s, t) => s + t.truePnL, 0);
  const totalFees = activities.totalMgmtFees + activities.totalGST;
  const totalDividends =
    activities.totalDividends - activities.totalWithholding;
  const totalNetIncome = totalPremiumCollected + totalDividends - totalFees;

  const cashAndTBills =
    holdings.cashBalance +
    holdings.tbills.reduce((s, t) => s + t.marketValue, 0);

  // Put exposure from open options
  const putExposure = Object.values(openOptions).reduce(
    (s, o) =>
      s +
      o.puts.reduce(
        (ps, p) => ps + (p ? p.strike * p.contracts * 100 : 0),
        0
      ),
    0
  );

  const equitiesWithShares = tickers.filter((t) => t.currentShares >= 100);
  const tickersWithOpenCalls = tickers.filter((t) => t.hasOpenCall).length;
  const tickersEligibleForCalls = tickers.filter((t) => t.canSellCalls).length;
  const coverageRatio =
    equitiesWithShares.length > 0
      ? tickersWithOpenCalls / equitiesWithShares.length
      : 0;

  // Annualized capital efficiency (assume data spans ~1 year)
  const capitalEfficiency =
    totalPortfolioValue > 0 ? (totalNetIncome / totalPortfolioValue) * 100 : 0;

  return {
    tickers,
    totalPortfolioValue,
    totalUnrealizedGL,
    totalPremiumCollected,
    totalTruePnL,
    totalFees,
    totalDividends,
    totalNetIncome,
    cashAndTBills,
    putExposure,
    tickersWithOpenCalls,
    tickersEligibleForCalls,
    coverageRatio,
    capitalEfficiency,
  };
}
