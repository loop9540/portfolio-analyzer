"use client";
import { useState, useEffect, useCallback } from "react";
import { Position } from "@/lib/analyze";
import { fmtMoney } from "@/lib/parseCSV";
import {
  fetchFullOptionChain,
  OptionChainData,
  OptionContract,
} from "@/lib/optionChain";

interface Props {
  positions: Record<string, Position>;
  premiumByTicker: Record<string, { sold: number; bought: number }>;
}

interface RowData {
  ticker: string;
  shares: number;
  avgCost: number;
  premium: number;
  currentPrice: number | null;
}

function estimateCallPremium(
  currentPrice: number,
  strike: number,
  dte: number,
  iv: number = 0.6
): number {
  const t = dte / 365;
  const moneyness = (strike - currentPrice) / currentPrice;
  const timeValue = currentPrice * iv * Math.sqrt(t) * 0.4;
  const intrinsic = Math.max(currentPrice - strike, 0);
  const otmDiscount = Math.exp(-moneyness * 5);
  return Math.max(intrinsic + timeValue * otmDiscount, 0.01);
}

export default function PnLTable({ positions, premiumByTicker }: Props) {
  const [rows, setRows] = useState<RowData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);

  useEffect(() => {
    const tickers = Object.keys(positions);
    if (tickers.length === 0) {
      setLoading(false);
      return;
    }

    const initialRows = tickers.map((ticker) => {
      const pos = positions[ticker];
      const avgCost = pos.totalCost / pos.shares;
      const p = premiumByTicker[ticker];
      const premium = p ? p.sold - p.bought : 0;
      return {
        ticker,
        shares: pos.shares,
        avgCost,
        premium,
        currentPrice: null,
      };
    });

    // Fetch prices client-side via CORS proxies
    const fetchPrices = async () => {
      const prices: Record<string, number | null> = {};
      const proxies = [
        (t: string) =>
          `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${t}?range=1d&interval=1d`)}`,
        (t: string) =>
          `https://corsproxy.io/?url=https://query1.finance.yahoo.com/v8/finance/chart/${t}?range=1d&interval=1d`,
      ];

      for (const proxyFn of proxies) {
        const missing = tickers.filter((t) => prices[t] == null);
        if (missing.length === 0) break;
        await Promise.all(
          missing.map(async (ticker) => {
            try {
              const resp = await fetch(proxyFn(ticker));
              const data = await resp.json();
              prices[ticker] =
                data?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
            } catch {
              /* try next proxy */
            }
          })
        );
      }

      setRows(
        initialRows.map((r) => ({
          ...r,
          currentPrice: prices[r.ticker] ?? null,
        }))
      );
      setLoading(false);
    };

    fetchPrices();
  }, [positions, premiumByTicker]);

  const updatePrice = useCallback((ticker: string, value: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.ticker === ticker
          ? { ...r, currentPrice: parseFloat(value) || null }
          : r
      )
    );
  }, []);

  if (Object.keys(positions).length === 0) return null;

  const computed = rows.map((r) => {
    const unrealized = r.currentPrice
      ? (r.currentPrice - r.avgCost) * r.shares
      : 0;
    const netPnL = unrealized + r.premium;
    return { ...r, unrealized, netPnL };
  });

  const totalUnrealized = computed.reduce((s, r) => s + r.unrealized, 0);
  const totalPremium = computed.reduce((s, r) => s + r.premium, 0);
  const totalNetPnL = computed.reduce((s, r) => s + r.netPnL, 0);

  return (
    <div className="card p-5 mb-6">
      <h2 className="text-base font-semibold mb-4">
        Unrealized P&L on Assigned Positions
      </h2>
      {loading ? (
        <p className="text-[var(--muted)] text-sm py-3">
          Fetching live prices...
        </p>
      ) : (
        <div className="max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                {[
                  "Ticker",
                  "Shares",
                  "Cost",
                  "Current",
                  "Unrealized",
                  "Premium",
                  "Net P&L",
                  "",
                ].map((h, i) => (
                  <th
                    key={h + i}
                    className={`${
                      i === 0 ? "text-left" : i === 7 ? "text-center" : "text-right"
                    } text-[var(--muted)] text-xs uppercase tracking-wide p-2 border-b border-[var(--border)]`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {computed.map((r) => (
                <>
                  <tr key={r.ticker}>
                    <td className="p-2 border-b border-[var(--border)]">
                      <span className="ticker-badge">{r.ticker}</span>
                    </td>
                    <td className="text-right tabular-nums p-2 border-b border-[var(--border)]">
                      {r.shares.toLocaleString()}
                    </td>
                    <td className="text-right tabular-nums p-2 border-b border-[var(--border)]">
                      ${r.avgCost.toFixed(2)}
                    </td>
                    <td className="text-right p-2 border-b border-[var(--border)]">
                      <input
                        type="number"
                        step="0.01"
                        className="bg-[var(--border)] border border-transparent rounded px-2 py-1 text-right text-sm text-[var(--text)] w-20 tabular-nums focus:border-[var(--accent)] focus:outline-none"
                        value={r.currentPrice?.toFixed(2) ?? ""}
                        placeholder="Price"
                        onChange={(e) => updatePrice(r.ticker, e.target.value)}
                      />
                    </td>
                    <td
                      className={`text-right tabular-nums p-2 border-b border-[var(--border)] ${
                        r.currentPrice
                          ? r.unrealized >= 0
                            ? "text-[var(--green)]"
                            : "text-[var(--red)]"
                          : ""
                      }`}
                    >
                      {r.currentPrice ? fmtMoney(r.unrealized) : "-"}
                    </td>
                    <td className="text-right tabular-nums text-[var(--green)] p-2 border-b border-[var(--border)]">
                      {fmtMoney(r.premium)}
                    </td>
                    <td
                      className={`text-right tabular-nums p-2 border-b border-[var(--border)] ${
                        r.currentPrice
                          ? r.netPnL >= 0
                            ? "text-[var(--green)]"
                            : "text-[var(--red)]"
                          : ""
                      }`}
                    >
                      {r.currentPrice ? fmtMoney(r.netPnL) : "-"}
                    </td>
                    <td className="text-center p-2 border-b border-[var(--border)]">
                      <button
                        onClick={() =>
                          setExpandedTicker(
                            expandedTicker === r.ticker ? null : r.ticker
                          )
                        }
                        disabled={!r.currentPrice}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                          expandedTicker === r.ticker
                            ? "bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30"
                            : r.currentPrice
                            ? "bg-[var(--border)] text-[var(--text)] hover:bg-[var(--accent)]/20 hover:text-[var(--accent)]"
                            : "bg-[var(--border)] text-[var(--muted)] cursor-not-allowed opacity-50"
                        }`}
                      >
                        Trade Suggest
                      </button>
                    </td>
                  </tr>
                  {expandedTicker === r.ticker && r.currentPrice && (
                    <tr key={r.ticker + "-suggest"}>
                      <td
                        colSpan={8}
                        className="p-0 border-b border-[var(--border)]"
                      >
                        <TradeSuggestionPanel
                          ticker={r.ticker}
                          currentPrice={r.currentPrice}
                          avgCost={r.avgCost}
                          shares={r.shares}
                          unrealizedLoss={
                            r.unrealized < 0 ? Math.abs(r.unrealized) : 0
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
                    totalUnrealized >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"
                  }`}
                >
                  {fmtMoney(totalUnrealized)}
                </td>
                <td className="text-right tabular-nums text-[var(--green)] p-2">
                  {fmtMoney(totalPremium)}
                </td>
                <td
                  className={`text-right tabular-nums p-2 ${
                    totalNetPnL >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"
                  }`}
                >
                  {fmtMoney(totalNetPnL)}
                </td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TradeSuggestionPanel({
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

  useEffect(() => {
    setLoadingChain(true);
    fetchFullOptionChain(ticker).then((data) => {
      setChainData(data);
      setLoadingChain(false);
    });
  }, [ticker]);

  if (loadingChain) {
    return (
      <div className="bg-[var(--accent)]/5 border-t border-[var(--accent)]/20 p-4">
        <p className="text-sm text-[var(--muted)]">
          Loading option chain for {ticker}...
        </p>
      </div>
    );
  }

  const isLive =
    chainData && chainData.source === "live" && chainData.expirations.length > 0;

  // Build display data per expiration
  const now = Date.now() / 1000;
  const expirations = isLive
    ? chainData.expirations
    : // Fallback: generate synthetic expirations
      [7, 30, 45].map((d) => Math.floor(now) + d * 86400);

  // For each expiration, find relevant strikes near currentPrice and avgCost
  const sections = expirations.map((exp) => {
    const dte = Math.max(Math.round((exp - now) / 86400), 1);
    const expDate = new Date(exp * 1000);
    const label =
      dte <= 10
        ? "Weekly"
        : dte <= 35
        ? "Monthly (~30 DTE)"
        : "45 DTE";
    const expLabel = `${label} — ${expDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

    const liveCalls = isLive ? chainData.calls[exp] || [] : [];

    // Target strikes: aggressive (2% OTM), moderate (5% OTM), at cost basis
    const targetStrikes = [
      {
        target: Math.round(currentPrice * 1.02 * 2) / 2,
        note: "Aggressive — high premium, likely assignment",
      },
      {
        target: Math.round(currentPrice * 1.05 * 2) / 2,
        note: "Moderate — balanced premium vs. upside",
      },
      {
        target: Math.round(avgCost * 2) / 2,
        note: "At cost basis — exit at breakeven if called",
      },
    ].filter((s) => s.target >= currentPrice * 0.95);

    // Deduplicate strikes
    const seen = new Set<number>();
    const uniqueStrikes = targetStrikes.filter((s) => {
      if (seen.has(s.target)) return false;
      seen.add(s.target);
      return true;
    });

    const cards = uniqueStrikes.map((ts) => {
      // Find closest live contract
      let liveMatch: OptionContract | null = null;
      if (liveCalls.length > 0) {
        liveMatch = liveCalls.reduce((best, c) =>
          Math.abs(c.strike - ts.target) < Math.abs(best.strike - ts.target)
            ? c
            : best
        );
        // Only use if within $1 of target
        if (liveMatch && Math.abs(liveMatch.strike - ts.target) > 1) {
          liveMatch = null;
        }
      }

      const strike = liveMatch ? liveMatch.strike : ts.target;
      const premium = liveMatch
        ? liveMatch.lastPrice > 0
          ? liveMatch.lastPrice
          : liveMatch.bid > 0
          ? (liveMatch.bid + liveMatch.ask) / 2
          : estimateCallPremium(currentPrice, strike, dte)
        : estimateCallPremium(currentPrice, strike, dte);

      const roundedPremium = Math.round(premium * 100) / 100;
      const totalIncome = roundedPremium * contracts * 100;
      const isLivePrice = liveMatch != null && (liveMatch.lastPrice > 0 || liveMatch.bid > 0);

      return {
        strike,
        premium: roundedPremium,
        totalIncome,
        note: ts.note,
        isLivePrice,
        bid: liveMatch?.bid ?? null,
        ask: liveMatch?.ask ?? null,
        volume: liveMatch?.volume ?? null,
        openInterest: liveMatch?.openInterest ?? null,
        iv: liveMatch?.impliedVolatility ?? null,
      };
    });

    // Only use real expiration timestamps for links (not synthetic ones)
    const isRealExp = isLive && chainData.expirations.includes(exp);
    return { expLabel, dte, cards, expTimestamp: exp, isRealExp };
  });

  // Recovery estimate using monthly income
  const monthlySection = sections.find((s) => s.dte >= 25 && s.dte <= 40);
  const monthlyIncome = monthlySection?.cards[1]?.totalIncome ?? monthlySection?.cards[0]?.totalIncome ?? 0;
  const recoveryMonths =
    unrealizedLoss > 0 && monthlyIncome > 0
      ? Math.ceil(unrealizedLoss / monthlyIncome)
      : null;

  return (
    <div className="bg-[var(--accent)]/5 border-t border-[var(--accent)]/20 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-[var(--accent)]">
            Covered Call Suggestions — {ticker}
          </h3>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
              isLive
                ? "bg-[var(--green)]/20 text-[var(--green)]"
                : "bg-[color:orange]/20 text-[color:orange]"
            }`}
          >
            {isLive ? "LIVE" : "ESTIMATED"}
          </span>
        </div>
        <div className="flex gap-4 text-xs text-[var(--muted)]">
          <span>
            {contracts} contract{contracts !== 1 ? "s" : ""} available
          </span>
          <span>Current: ${currentPrice.toFixed(2)}</span>
          <span>Cost: ${avgCost.toFixed(2)}</span>
          {recoveryMonths != null && unrealizedLoss > 0 && (
            <span className="text-[color:orange]">
              Est. {recoveryMonths} month{recoveryMonths !== 1 ? "s" : ""} to
              recover {fmtMoney(unrealizedLoss)}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {sections.map(({ expLabel, cards, expTimestamp, isRealExp }) => {
          const chainUrl = isRealExp
            ? `https://finance.yahoo.com/quote/${ticker}/options/?date=${expTimestamp}`
            : `https://finance.yahoo.com/quote/${ticker}/options/`;
          return (
          <div key={expLabel}>
            <div className="text-xs font-medium text-[var(--muted)] mb-2 uppercase tracking-wide">
              {expLabel}
              <a
                href={chainUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 text-[var(--accent)] hover:underline normal-case tracking-normal"
              >
                View chain &#8599;
              </a>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {cards.map((c, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3"
                >
                  <div className="flex items-center justify-between mb-1">
                    <a
                      href={chainUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold hover:text-[var(--accent)] transition-colors"
                    >
                      ${c.strike.toFixed(1)} Call &#8599;
                    </a>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        c.isLivePrice
                          ? "bg-[var(--green)]/20 text-[var(--green)]"
                          : "bg-[var(--accent)]/20 text-[var(--accent)]"
                      }`}
                    >
                      {c.isLivePrice ? "" : "~"}${c.premium.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--muted)] mb-2">
                    {c.note}
                  </div>
                  {c.isLivePrice && (
                    <div className="flex gap-3 text-[10px] text-[var(--muted)] mb-2">
                      {c.bid != null && (
                        <span>
                          Bid: ${c.bid.toFixed(2)} / Ask: $
                          {c.ask?.toFixed(2)}
                        </span>
                      )}
                      {c.volume != null && c.volume > 0 && (
                        <span>Vol: {c.volume.toLocaleString()}</span>
                      )}
                      {c.openInterest != null && c.openInterest > 0 && (
                        <span>OI: {c.openInterest.toLocaleString()}</span>
                      )}
                      {c.iv != null && c.iv > 0 && (
                        <span>IV: {(c.iv * 100).toFixed(0)}%</span>
                      )}
                    </div>
                  )}
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--muted)]">
                      {contracts}x contracts
                    </span>
                    <span className="text-[var(--green)] font-semibold">
                      {fmtMoney(c.totalIncome)}
                    </span>
                  </div>
                  {c.strike < avgCost && (
                    <div className="text-xs text-[color:orange] mt-1">
                      Below cost basis — assignment locks in loss of{" "}
                      {fmtMoney((avgCost - c.strike) * contracts * 100)}
                    </div>
                  )}
                  {c.strike >= avgCost && (
                    <div className="text-xs text-[var(--green)] mt-1">
                      If called: exit at{" "}
                      {fmtMoney(
                        (c.strike - avgCost) * contracts * 100 + c.totalIncome
                      )}{" "}
                      profit
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
