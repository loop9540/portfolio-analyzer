"use client";
import { useState } from "react";
import { PremiumEntry } from "@/lib/analyze";
import { fmtMoney } from "@/lib/parseCSV";

type Filter = "all" | "open" | "exited" | "profitable" | "losing";
type SortKey = "net" | "sold" | "btc";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "exited", label: "Exited" },
  { key: "profitable", label: "Profitable" },
  { key: "losing", label: "Losing" },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: "net", label: "Net" },
  { key: "sold", label: "Sold" },
  { key: "btc", label: "BTC%" },
];

export default function PremiumTable({
  entries,
  openTickers,
}: {
  entries: PremiumEntry[];
  openTickers?: Set<string>;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("net");
  const hasHoldings = openTickers != null;

  // Filter
  let filtered = entries;
  if (filter === "open" && openTickers) {
    filtered = entries.filter((e) => openTickers.has(e.ticker));
  } else if (filter === "exited" && openTickers) {
    filtered = entries.filter((e) => !openTickers.has(e.ticker));
  } else if (filter === "profitable") {
    filtered = entries.filter((e) => e.net > 0);
  } else if (filter === "losing") {
    filtered = entries.filter((e) => e.net <= 0);
  }

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === "net") return b.net - a.net;
    if (sortKey === "sold") return b.sold - a.sold;
    // BTC ratio (bought / sold) — lower is better
    const aRatio = a.sold > 0 ? a.bought / a.sold : 1;
    const bRatio = b.sold > 0 ? b.bought / b.sold : 1;
    return aRatio - bRatio;
  });

  const totalSold = sorted.reduce((s, e) => s + e.sold, 0);
  const totalBought = sorted.reduce((s, e) => s + e.bought, 0);
  const totalNet = totalSold - totalBought;

  return (
    <div className="card p-5">
      <h2 className="text-base font-semibold mb-3">Premium Breakdown</h2>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-1 mb-3">
        {FILTERS.filter(
          (f) => hasHoldings || (f.key !== "open" && f.key !== "exited")
        ).map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              filter === f.key
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="text-[var(--muted)] text-xs mx-1">|</span>
        {SORTS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSortKey(s.key)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              sortKey === s.key
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {s.label}
            {sortKey === s.key && " ▼"}
          </button>
        ))}
        <span className="text-xs text-[var(--muted)] ml-2">
          {sorted.length}/{entries.length} tickers
        </span>
      </div>

      <div className="max-h-[500px] overflow-y-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="text-left text-[var(--muted)] text-xs uppercase tracking-wide p-2 border-b border-[var(--border)]">
                Ticker
              </th>
              <th className="text-right text-[var(--muted)] text-xs uppercase tracking-wide p-2 border-b border-[var(--border)]">
                Sold
              </th>
              <th className="text-right text-[var(--muted)] text-xs uppercase tracking-wide p-2 border-b border-[var(--border)]">
                Bought
              </th>
              <th className="text-right text-[var(--muted)] text-xs uppercase tracking-wide p-2 border-b border-[var(--border)]">
                {sortKey === "btc" ? "BTC%" : "Net"}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((e) => {
              const btcPct =
                e.sold > 0 ? ((e.bought / e.sold) * 100).toFixed(0) : "-";
              return (
                <tr key={e.ticker}>
                  <td className="p-2 border-b border-[var(--border)]">
                    <span className="ticker-badge">{e.ticker}</span>
                    {hasHoldings && openTickers.has(e.ticker) && (
                      <span className="text-[10px] ml-1 text-[var(--green)]">
                        ●
                      </span>
                    )}
                  </td>
                  <td className="text-right tabular-nums text-[var(--green)] p-2 border-b border-[var(--border)]">
                    {fmtMoney(e.sold)}
                  </td>
                  <td className="text-right tabular-nums text-[var(--red)] p-2 border-b border-[var(--border)]">
                    {fmtMoney(-e.bought)}
                  </td>
                  <td
                    className={`text-right tabular-nums p-2 border-b border-[var(--border)] ${
                      sortKey === "btc"
                        ? "text-[var(--muted)]"
                        : e.net >= 0
                        ? "text-[var(--green)]"
                        : "text-[var(--red)]"
                    }`}
                  >
                    {sortKey === "btc" ? `${btcPct}%` : fmtMoney(e.net)}
                  </td>
                </tr>
              );
            })}
            <tr className="font-bold border-t-2 border-[var(--border)]">
              <td className="p-2">
                TOTAL
              </td>
              <td className="text-right tabular-nums text-[var(--green)] p-2">
                {fmtMoney(totalSold)}
              </td>
              <td className="text-right tabular-nums text-[var(--red)] p-2">
                {fmtMoney(-totalBought)}
              </td>
              <td className="text-right tabular-nums text-[var(--green)] p-2">
                {fmtMoney(totalNet)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
