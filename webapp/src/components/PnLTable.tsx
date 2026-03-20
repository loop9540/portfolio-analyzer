"use client";
import { useState, useEffect, useCallback } from "react";
import { Position } from "@/lib/analyze";
import { fmtMoney } from "@/lib/parseCSV";

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

interface Suggestion {
  strike: number;
  dte: number;
  expLabel: string;
  estPremium: number;
  contracts: number;
  totalIncome: number;
  note: string;
}

function estimateCallPremium(
  currentPrice: number,
  strike: number,
  dte: number,
  iv: number = 0.6
): number {
  // Simplified Black-Scholes-ish estimation for covered call premium
  const t = dte / 365;
  const moneyness = (strike - currentPrice) / currentPrice;
  const timeValue = currentPrice * iv * Math.sqrt(t) * 0.4;
  const intrinsic = Math.max(currentPrice - strike, 0);
  const otmDiscount = Math.exp(-moneyness * 5);
  return Math.max(intrinsic + timeValue * otmDiscount, 0.01);
}

function generateSuggestions(
  ticker: string,
  currentPrice: number,
  avgCost: number,
  shares: number
): Suggestion[] {
  const contracts = Math.floor(shares / 100);
  if (contracts === 0 || currentPrice <= 0) return [];

  const suggestions: Suggestion[] = [];
  const now = new Date();

  // Generate for 3 timeframes
  const timeframes = [
    { dte: 7, label: "Weekly" },
    { dte: 30, label: "Monthly (~30 DTE)" },
    { dte: 45, label: "45 DTE" },
  ];

  // Strike strategies
  const strikeStrategies = [
    {
      name: "Aggressive",
      strikeOffset: 0.02,
      note: "High premium, likely assignment",
    },
    {
      name: "Moderate",
      strikeOffset: 0.05,
      note: "Balanced premium vs. upside",
    },
    {
      name: "At cost basis",
      strikeAbs: avgCost,
      note: "Exit at breakeven if called",
    },
  ];

  for (const tf of timeframes) {
    const expDate = new Date(now);
    expDate.setDate(expDate.getDate() + tf.dte);
    // Round to next Friday
    const dayOfWeek = expDate.getDay();
    const daysToFri = (5 - dayOfWeek + 7) % 7 || 7;
    expDate.setDate(expDate.getDate() + (dayOfWeek === 5 ? 0 : daysToFri));
    const expLabel = `${tf.label} — ${expDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    const actualDte = Math.max(
      Math.round(
        (expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      ),
      1
    );

    for (const ss of strikeStrategies) {
      const strike =
        ss.strikeAbs ??
        Math.round((currentPrice * (1 + ss.strikeOffset)) * 2) / 2;

      // Skip if strike is below current price for "at cost basis" when in profit
      if (strike < currentPrice * 0.95) continue;

      const est = estimateCallPremium(currentPrice, strike, actualDte);
      const roundedPremium = Math.round(est * 100) / 100;

      suggestions.push({
        strike,
        dte: actualDte,
        expLabel,
        estPremium: roundedPremium,
        contracts,
        totalIncome: roundedPremium * contracts * 100,
        note: ss.note,
      });
    }
  }

  return suggestions;
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
                        className="bg-[var(--border)] border border-transparent rounded px-2 py-1 text-right text-sm text-[var(--text)] w-20 tabular-nums focus:border-blue-500 focus:outline-none"
                        value={r.currentPrice?.toFixed(2) ?? ""}
                        placeholder="Price"
                        onChange={(e) => updatePrice(r.ticker, e.target.value)}
                      />
                    </td>
                    <td
                      className={`text-right tabular-nums p-2 border-b border-[var(--border)] ${
                        r.currentPrice
                          ? r.unrealized >= 0
                            ? "text-green-500"
                            : "text-red-500"
                          : ""
                      }`}
                    >
                      {r.currentPrice ? fmtMoney(r.unrealized) : "-"}
                    </td>
                    <td className="text-right tabular-nums text-green-500 p-2 border-b border-[var(--border)]">
                      {fmtMoney(r.premium)}
                    </td>
                    <td
                      className={`text-right tabular-nums p-2 border-b border-[var(--border)] ${
                        r.currentPrice
                          ? r.netPnL >= 0
                            ? "text-green-500"
                            : "text-red-500"
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
                            ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                            : r.currentPrice
                            ? "bg-[var(--border)] text-[var(--text)] hover:bg-purple-500/20 hover:text-purple-400"
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
                    totalUnrealized >= 0 ? "text-green-500" : "text-red-500"
                  }`}
                >
                  {fmtMoney(totalUnrealized)}
                </td>
                <td className="text-right tabular-nums text-green-500 p-2">
                  {fmtMoney(totalPremium)}
                </td>
                <td
                  className={`text-right tabular-nums p-2 ${
                    totalNetPnL >= 0 ? "text-green-500" : "text-red-500"
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
  const suggestions = generateSuggestions(ticker, currentPrice, avgCost, shares);
  const contracts = Math.floor(shares / 100);

  // Group by timeframe
  const grouped: Record<string, Suggestion[]> = {};
  for (const s of suggestions) {
    if (!grouped[s.expLabel]) grouped[s.expLabel] = [];
    grouped[s.expLabel].push(s);
  }

  const recoveryMonths =
    unrealizedLoss > 0 && suggestions.length > 0
      ? Math.ceil(
          unrealizedLoss /
            (suggestions.find((s) => s.dte >= 28 && s.dte <= 35)
              ?.totalIncome ?? suggestions[0].totalIncome)
        )
      : null;

  return (
    <div className="bg-purple-500/5 border-t border-purple-500/20 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-purple-400">
          Covered Call Suggestions — {ticker}
        </h3>
        <div className="flex gap-4 text-xs text-[var(--muted)]">
          <span>
            {contracts} contract{contracts !== 1 ? "s" : ""} available
          </span>
          <span>Current: ${currentPrice.toFixed(2)}</span>
          <span>Cost: ${avgCost.toFixed(2)}</span>
          {recoveryMonths && unrealizedLoss > 0 && (
            <span className="text-yellow-400">
              Est. {recoveryMonths} month{recoveryMonths !== 1 ? "s" : ""} to
              recover {fmtMoney(unrealizedLoss)}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {Object.entries(grouped).map(([label, sugs]) => (
          <div key={label}>
            <div className="text-xs font-medium text-[var(--muted)] mb-2 uppercase tracking-wide">
              {label}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {sugs.map((s, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold">
                      ${s.strike.toFixed(1)} Call
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-400">
                      ~${s.estPremium.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--muted)] mb-2">
                    {s.note}
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--muted)]">
                      {s.contracts}x contracts
                    </span>
                    <span className="text-green-500 font-semibold">
                      {fmtMoney(s.totalIncome)}
                    </span>
                  </div>
                  {s.strike < avgCost && (
                    <div className="text-xs text-yellow-400 mt-1">
                      Below cost basis — assignment locks in loss of{" "}
                      {fmtMoney((avgCost - s.strike) * s.contracts * 100)}
                    </div>
                  )}
                  {s.strike >= avgCost && (
                    <div className="text-xs text-green-400 mt-1">
                      If called: exit at{" "}
                      {fmtMoney(
                        (s.strike - avgCost) * s.contracts * 100 +
                          s.totalIncome
                      )}{" "}
                      profit
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
