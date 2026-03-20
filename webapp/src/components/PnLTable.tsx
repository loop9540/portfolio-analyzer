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

export default function PnLTable({ positions, premiumByTicker }: Props) {
  const [rows, setRows] = useState<RowData[]>([]);
  const [loading, setLoading] = useState(true);

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
      return { ticker, shares: pos.shares, avgCost, premium, currentPrice: null };
    });

    fetch(`/api/prices?tickers=${tickers.join(",")}`)
      .then((r) => r.json())
      .then((prices: Record<string, number | null>) => {
        setRows(
          initialRows.map((r) => ({
            ...r,
            currentPrice: prices[r.ticker] ?? null,
          }))
        );
        setLoading(false);
      })
      .catch(() => {
        setRows(initialRows);
        setLoading(false);
      });
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
        <div className="max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                {["Ticker", "Shares", "Cost", "Current", "Unrealized", "Premium", "Net P&L"].map(
                  (h, i) => (
                    <th
                      key={h}
                      className={`${
                        i === 0 ? "text-left" : "text-right"
                      } text-[var(--muted)] text-xs uppercase tracking-wide p-2 border-b border-[var(--border)]`}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {computed.map((r) => (
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
                </tr>
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
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
