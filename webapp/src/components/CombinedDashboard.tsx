"use client";
import { useMemo, useState } from "react";
import { AnalysisResult } from "@/lib/analyze";
import { HoldingsData } from "@/lib/parseHoldings";
import { analyzeCombined, CombinedAnalysis } from "@/lib/analyzeCombined";
import { fmtMoney } from "@/lib/parseCSV";
import PremiumChart from "./PremiumChart";
import PremiumTable from "./PremiumTable";
import TransactionList from "./TransactionList";
import Critique from "./Critique";
import {
  fetchFullOptionChain,
  OptionChainData,
  OptionContract,
  getEstimatedExpirations,
} from "@/lib/optionChain";
import { snapStrike, findLiveMatch } from "@/lib/strikeSnap";

function estimateCallPremium(
  currentPrice: number,
  strike: number,
  dte: number
): number {
  const t = dte / 365;
  const moneyness = (strike - currentPrice) / currentPrice;
  const timeValue = currentPrice * 0.6 * Math.sqrt(t) * 0.4;
  const intrinsic = Math.max(currentPrice - strike, 0);
  const otmDiscount = Math.exp(-moneyness * 5);
  return Math.max(intrinsic + timeValue * otmDiscount, 0.01);
}

interface Props {
  activities: AnalysisResult;
  holdings: HoldingsData;
}

export default function CombinedDashboard({ activities, holdings }: Props) {
  const combined = useMemo(
    () => analyzeCombined(activities, holdings),
    [activities, holdings]
  );

  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);

  // Build set of tickers with open positions (shares or options)
  const openTickers = useMemo(() => {
    const s = new Set<string>();
    for (const eq of holdings.equities) s.add(eq.symbol.trim().toUpperCase());
    for (const opt of holdings.options) {
      const m = opt.holding.match(/(?:PUT|CALL)\s+100\s+(\w+)/);
      if (m) s.add(m[1]);
    }
    return s;
  }, [holdings]);

  return (
    <div>
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {[
          {
            label: "Portfolio Value",
            value: fmtMoney(combined.totalPortfolioValue),
            positive: true,
          },
          {
            label: "True P&L",
            value: fmtMoney(combined.totalTruePnL),
            positive: combined.totalTruePnL >= 0,
            sub: "Unrealized + Premium",
          },
          {
            label: "Premium Collected",
            value: fmtMoney(combined.totalPremiumCollected),
            positive: true,
          },
          {
            label: "Unrealized G/L",
            value: fmtMoney(combined.totalUnrealizedGL),
            positive: combined.totalUnrealizedGL >= 0,
          },
          {
            label: "Coverage",
            value: `${combined.tickersWithOpenCalls}/${combined.tickersWithOpenCalls + combined.tickersEligibleForCalls}`,
            positive: combined.coverageRatio >= 0.5,
            sub: `${combined.tickersEligibleForCalls} uncovered`,
          },
          {
            label: "Cash + T-Bills",
            value: fmtMoney(combined.cashAndTBills),
            positive: true,
          },
        ].map((k) => (
          <div key={k.label} className="card p-4">
            <div className="text-xs uppercase tracking-wide text-[var(--muted)] mb-1">
              {k.label}
            </div>
            <div
              className={`text-xl font-bold tabular-nums ${
                k.positive ? "text-[var(--green)]" : "text-[var(--red)]"
              }`}
            >
              {k.value}
            </div>
            {k.sub && (
              <div className="text-[10px] text-[var(--muted)] mt-0.5">
                {k.sub}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* True P&L Table */}
      <div className="card p-5 mb-6">
        <h2 className="text-base font-semibold mb-4">
          True P&L — Unrealized + Premium
        </h2>
        <div className="max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                {[
                  "Ticker",
                  "Shares",
                  "Cost",
                  "Price",
                  "Unrealized",
                  "Premium",
                  "True P&L",
                  "True %",
                  "Status",
                  "",
                ].map((h, i) => (
                  <th
                    key={h + i}
                    className={`${
                      i === 0 || i === 8
                        ? "text-left"
                        : i === 9
                        ? "text-center"
                        : "text-right"
                    } text-[var(--muted)] text-xs uppercase tracking-wide p-2 border-b border-[var(--border)]`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {combined.tickers
                .filter((t) => t.currentShares > 0 || t.premiumCollected !== 0)
                .map((t) => (
                  <>
                    <tr key={t.ticker}>
                      <td className="p-2 border-b border-[var(--border)]">
                        <span className="ticker-badge">{t.ticker}</span>
                        {t.currentShares === 0 && t.hasOpenPut && (
                          <span className="text-[10px] text-[var(--muted)] ml-1">
                            puts open
                          </span>
                        )}
                        {t.currentShares === 0 && !t.hasOpenPut && !t.hasOpenCall && (
                          <span className="text-[10px] text-[var(--muted)] ml-1">
                            exited
                          </span>
                        )}
                      </td>
                      <td className="text-right tabular-nums p-2 border-b border-[var(--border)]">
                        {t.currentShares > 0
                          ? t.currentShares.toLocaleString()
                          : "-"}
                      </td>
                      <td className="text-right tabular-nums p-2 border-b border-[var(--border)]">
                        {t.avgCost > 0 ? `$${t.avgCost.toFixed(2)}` : "-"}
                      </td>
                      <td className="text-right tabular-nums p-2 border-b border-[var(--border)]">
                        {t.currentPrice > 0
                          ? `$${t.currentPrice.toFixed(2)}`
                          : "-"}
                      </td>
                      <td
                        className={`text-right tabular-nums p-2 border-b border-[var(--border)] ${
                          t.unrealizedGL >= 0
                            ? "text-[var(--green)]"
                            : "text-[var(--red)]"
                        }`}
                      >
                        {t.unrealizedGL !== 0 ? fmtMoney(t.unrealizedGL) : "-"}
                      </td>
                      <td className="text-right tabular-nums text-[var(--green)] p-2 border-b border-[var(--border)]">
                        {t.premiumCollected !== 0
                          ? fmtMoney(t.premiumCollected)
                          : "-"}
                      </td>
                      <td
                        className={`text-right tabular-nums font-semibold p-2 border-b border-[var(--border)] ${
                          t.truePnL >= 0
                            ? "text-[var(--green)]"
                            : "text-[var(--red)]"
                        }`}
                      >
                        {fmtMoney(t.truePnL)}
                      </td>
                      <td
                        className={`text-right tabular-nums p-2 border-b border-[var(--border)] ${
                          t.truePnLPct >= 0
                            ? "text-[var(--green)]"
                            : "text-[var(--red)]"
                        }`}
                      >
                        {t.bookValue !== 0
                          ? `${t.truePnLPct >= 0 ? "+" : ""}${t.truePnLPct.toFixed(1)}%`
                          : "-"}
                      </td>
                      <td className="p-2 border-b border-[var(--border)]">
                        {t.hasOpenCall ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--green)]/20 text-[var(--green)] font-medium">
                            COVERED
                          </span>
                        ) : t.currentShares >= 100 ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[color:orange]/20 text-[color:orange] font-medium">
                            OPEN
                          </span>
                        ) : t.currentShares > 0 ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--border)] text-[var(--muted)] font-medium">
                            &lt;100
                          </span>
                        ) : null}
                        {t.hasOpenCall && (
                          <div className="text-[10px] text-[var(--muted)] mt-0.5">
                            C: {t.openCallDetails}
                          </div>
                        )}
                        {t.hasOpenPut && (
                          <div className="text-[10px] text-[var(--muted)] mt-0.5">
                            P: {t.openPutDetails}
                          </div>
                        )}
                      </td>
                      <td className="text-center p-2 border-b border-[var(--border)]">
                        {t.canSellCalls && (
                          <button
                            onClick={() =>
                              setExpandedTicker(
                                expandedTicker === t.ticker ? null : t.ticker
                              )
                            }
                            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                              expandedTicker === t.ticker
                                ? "bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30"
                                : "bg-[var(--border)] text-[var(--text)] hover:bg-[var(--accent)]/20 hover:text-[var(--accent)]"
                            }`}
                          >
                            Trade Suggest
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedTicker === t.ticker && t.canSellCalls && (
                      <tr key={t.ticker + "-suggest"}>
                        <td
                          colSpan={10}
                          className="p-0 border-b border-[var(--border)]"
                        >
                          <CombinedTradeSuggest
                            ticker={t.ticker}
                            currentPrice={t.currentPrice}
                            avgCost={t.avgCost}
                            shares={t.currentShares}
                            unrealizedLoss={
                              t.unrealizedGL < 0
                                ? Math.abs(t.unrealizedGL)
                                : 0
                            }
                          />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              <tr className="font-bold border-t-2 border-[var(--border)]">
                <td className="p-2">TOTAL</td>
                <td></td>
                <td></td>
                <td></td>
                <td
                  className={`text-right tabular-nums p-2 ${
                    combined.totalUnrealizedGL >= 0
                      ? "text-[var(--green)]"
                      : "text-[var(--red)]"
                  }`}
                >
                  {fmtMoney(combined.totalUnrealizedGL)}
                </td>
                <td className="text-right tabular-nums text-[var(--green)] p-2">
                  {fmtMoney(combined.totalPremiumCollected)}
                </td>
                <td
                  className={`text-right tabular-nums p-2 ${
                    combined.totalTruePnL >= 0
                      ? "text-[var(--green)]"
                      : "text-[var(--red)]"
                  }`}
                >
                  {fmtMoney(combined.totalTruePnL)}
                </td>
                <td></td>
                <td></td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Income Breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Net Premium", value: combined.totalPremiumCollected, positive: true },
          { label: "Dividends (Net)", value: combined.totalDividends, positive: true },
          { label: "Fees", value: -combined.totalFees, positive: false },
          { label: "Net Income", value: combined.totalNetIncome, positive: combined.totalNetIncome >= 0 },
        ].map((k) => (
          <div key={k.label} className="card p-4">
            <div className="text-xs uppercase tracking-wide text-[var(--muted)] mb-1">
              {k.label}
            </div>
            <div
              className={`text-lg font-bold tabular-nums ${
                k.positive ? "text-[var(--green)]" : "text-[var(--red)]"
              }`}
            >
              {fmtMoney(k.value)}
            </div>
          </div>
        ))}
      </div>

      {/* Premium Chart + Table */}
      <PremiumChart entries={activities.premiumEntries} openTickers={openTickers} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
        <PremiumTable entries={activities.premiumEntries} openTickers={openTickers} />
        <div className="card p-5">
          <h2 className="text-base font-semibold mb-4">Put Exposure</h2>
          <div className="text-2xl font-bold text-[var(--red)] mb-3">
            {fmtMoney(combined.putExposure)}
          </div>
          <div className="space-y-2">
            {holdings.options
              .map((o) => {
                const m = o.holding.match(
                  /PUT\s+100\s+(\w+)\s+(\S+)\s+(\S+)/
                );
                if (!m || o.quantity >= 0) return null;
                return {
                  ticker: m[1],
                  expiry: m[2],
                  strike: parseFloat(m[3]),
                  contracts: Math.abs(o.quantity),
                  exposure: parseFloat(m[3]) * Math.abs(o.quantity) * 100,
                  gl: o.gl,
                };
              })
              .filter((p) => p !== null)
              .sort((a, b) => b.exposure - a.exposure)
              .map((p, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm py-1 border-b border-[var(--border)] last:border-b-0"
                >
                  <span>
                    <span className="ticker-badge mr-2">{p.ticker}</span>
                    {p.contracts}x ${p.strike} PUT — {p.expiry}
                  </span>
                  <span className="tabular-nums text-[var(--muted)]">
                    {fmtMoney(p.exposure)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Critique & Optimization */}
      <Critique data={activities} holdings={holdings} />

      {/* Transactions */}
      <TransactionList transactions={activities.transactions} />
    </div>
  );
}

function CombinedTradeSuggest({
  ticker,
  currentPrice,
  avgCost,
  shares,
  unrealizedLoss,
}: {
  ticker: string;
  currentPrice: number;
  avgCost: number;
  shares: number;
  unrealizedLoss: number;
}) {
  const [chainData, setChainData] = useState<OptionChainData | null>(null);
  const [loadingChain, setLoadingChain] = useState(true);
  const contracts = Math.floor(shares / 100);

  useState(() => {
    fetchFullOptionChain(ticker).then((data) => {
      setChainData(data);
      setLoadingChain(false);
    });
  });

  if (loadingChain && !chainData) {
    return (
      <div className="bg-[var(--accent)]/5 border-t border-[var(--accent)]/20 p-4">
        <p className="text-sm text-[var(--muted)]">
          Loading option chain for {ticker}...
        </p>
      </div>
    );
  }

  const isLive =
    chainData &&
    chainData.source === "live" &&
    chainData.expirations.length > 0;

  const now = Date.now() / 1000;
  const expirations = isLive
    ? chainData.expirations
    : getEstimatedExpirations();

  const sections = expirations.map((exp) => {
    const dte = Math.max(Math.round((exp - now) / 86400), 1);
    const expDate = new Date(exp * 1000);
    const label =
      dte <= 10 ? "Weekly" : dte <= 35 ? "Monthly (~30 DTE)" : "45 DTE";
    const expLabel = `${label} — ${expDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

    const liveCalls = isLive ? chainData.calls[exp] || [] : [];

    const targetStrikes = [
      { target: snapStrike(currentPrice * 1.02, liveCalls), note: "Aggressive — high premium, likely assignment" },
      { target: snapStrike(currentPrice * 1.05, liveCalls), note: "Moderate — balanced premium vs. upside" },
      { target: snapStrike(avgCost, liveCalls), note: "At cost basis — exit at breakeven if called" },
    ].filter((s) => s.target >= currentPrice * 0.95);

    const seen = new Set<number>();
    const uniqueStrikes = targetStrikes.filter((s) => {
      if (seen.has(s.target)) return false;
      seen.add(s.target);
      return true;
    });

    const cards = uniqueStrikes.map((ts) => {
      const liveMatch = findLiveMatch(ts.target, liveCalls);
      const strike = liveMatch ? liveMatch.strike : ts.target;
      const premium = liveMatch
        ? liveMatch.lastPrice > 0 ? liveMatch.lastPrice : liveMatch.bid > 0 ? (liveMatch.bid + liveMatch.ask) / 2 : estimateCallPremium(currentPrice, strike, dte)
        : estimateCallPremium(currentPrice, strike, dte);
      const roundedPremium = Math.round(premium * 100) / 100;
      const isLivePrice = liveMatch != null && (liveMatch.lastPrice > 0 || liveMatch.bid > 0);
      return {
        strike, premium: roundedPremium, totalIncome: roundedPremium * contracts * 100, note: ts.note, isLivePrice,
        bid: liveMatch?.bid ?? null, ask: liveMatch?.ask ?? null,
        volume: liveMatch?.volume ?? null, openInterest: liveMatch?.openInterest ?? null,
        iv: liveMatch?.impliedVolatility ?? null,
      };
    });

    const isRealExp = isLive && chainData.expirations.includes(exp);
    const chainUrl = `https://www.barchart.com/stocks/quotes/${ticker}/options?expiration=${new Date(exp * 1000).toISOString().slice(0, 10)}`;
    return { expLabel, dte, cards, chainUrl };
  });

  const monthlySection = sections.find((s) => s.dte >= 25 && s.dte <= 40);
  const monthlyIncome = monthlySection?.cards[1]?.totalIncome ?? monthlySection?.cards[0]?.totalIncome ?? 0;
  const recoveryMonths = unrealizedLoss > 0 && monthlyIncome > 0 ? Math.ceil(unrealizedLoss / monthlyIncome) : null;

  return (
    <div className="bg-[var(--accent)]/5 border-t border-[var(--accent)]/20 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-[var(--accent)]">
            Covered Call Suggestions — {ticker}
          </h3>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${isLive ? "bg-[var(--green)]/20 text-[var(--green)]" : "bg-[color:orange]/20 text-[color:orange]"}`}>
            {isLive ? "LIVE" : "ESTIMATED"}
          </span>
        </div>
        <div className="flex gap-4 text-xs text-[var(--muted)]">
          <span>{contracts} contract{contracts !== 1 ? "s" : ""}</span>
          <span>Current: ${currentPrice.toFixed(2)}</span>
          <span>Cost: ${avgCost.toFixed(2)}</span>
          {recoveryMonths != null && unrealizedLoss > 0 && (
            <span className="text-[color:orange]">
              Est. {recoveryMonths} month{recoveryMonths !== 1 ? "s" : ""} to recover {fmtMoney(unrealizedLoss)}
            </span>
          )}
        </div>
      </div>
      <div className="space-y-4">
        {sections.map(({ expLabel, cards, chainUrl }) => (
          <div key={expLabel}>
            <div className="text-xs font-medium text-[var(--muted)] mb-2 uppercase tracking-wide">
              {expLabel}
              <a href={chainUrl} target="_blank" rel="noopener noreferrer" className="ml-2 text-[var(--accent)] hover:underline normal-case tracking-normal">
                View chain &#8599;
              </a>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {cards.map((c, i) => (
                <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
                  <div className="flex items-center justify-between mb-1">
                    <a href={chainUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold hover:text-[var(--accent)] transition-colors">
                      ${c.strike.toFixed(1)} Call &#8599;
                    </a>
                    <span className={`text-xs px-2 py-0.5 rounded ${c.isLivePrice ? "bg-[var(--green)]/20 text-[var(--green)]" : "bg-[var(--accent)]/20 text-[var(--accent)]"}`}>
                      {c.isLivePrice ? "" : "~"}${c.premium.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--muted)] mb-2">{c.note}</div>
                  {c.isLivePrice && (
                    <div className="flex gap-3 text-[10px] text-[var(--muted)] mb-2">
                      {c.bid != null && <span>Bid: ${c.bid.toFixed(2)} / Ask: ${c.ask?.toFixed(2)}</span>}
                      {c.volume != null && c.volume > 0 && <span>Vol: {c.volume.toLocaleString()}</span>}
                      {c.openInterest != null && c.openInterest > 0 && <span>OI: {c.openInterest.toLocaleString()}</span>}
                      {c.iv != null && c.iv > 0 && <span>IV: {(c.iv * 100).toFixed(0)}%</span>}
                    </div>
                  )}
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--muted)]">{contracts}x contracts</span>
                    <span className="text-[var(--green)] font-semibold">{fmtMoney(c.totalIncome)}</span>
                  </div>
                  {c.strike < avgCost && (
                    <div className="text-xs text-[color:orange] mt-1">
                      Below cost basis — assignment locks in loss of {fmtMoney((avgCost - c.strike) * contracts * 100)}
                    </div>
                  )}
                  {c.strike >= avgCost && (
                    <div className="text-xs text-[var(--green)] mt-1">
                      If called: exit at {fmtMoney((c.strike - avgCost) * contracts * 100 + c.totalIncome)} profit
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
