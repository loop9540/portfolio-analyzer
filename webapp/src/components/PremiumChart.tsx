"use client";
import { useState } from "react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
} from "chart.js";
import { PremiumEntry } from "@/lib/analyze";
import { fmtMoney } from "@/lib/parseCSV";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

const COLORS = [
  "#7D2EFF", "#008751", "#EB0F29", "#0078FF", "#9d61ff", "#06b6d4",
  "#f59e0b", "#ec4899", "#14b8a6", "#8b5cf6", "#eab308", "#5B636A",
];

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

export default function PremiumChart({
  entries,
  openTickers,
}: {
  entries: PremiumEntry[];
  openTickers?: Set<string>;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("net");
  const hasHoldings = openTickers != null;

  const style = getComputedStyle(document.documentElement);
  const mutedColor = style.getPropertyValue("--muted").trim() || "#979EA8";
  const borderColor = style.getPropertyValue("--border").trim() || "#374151";

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
    const aRatio = a.sold > 0 ? a.bought / a.sold : 1;
    const bRatio = b.sold > 0 ? b.bought / b.sold : 1;
    return aRatio - bRatio;
  });

  // Chart data based on sort
  const chartData = sorted.map((e) => {
    if (sortKey === "sold") return e.sold;
    if (sortKey === "btc") return e.sold > 0 ? (e.bought / e.sold) * 100 : 0;
    return e.net;
  });

  const yLabel = sortKey === "sold" ? "Sold" : sortKey === "btc" ? "BTC%" : "Net Premium";

  return (
    <div className="card p-5 mb-6">
      <h2 className="text-base font-semibold mb-3">Net Premium by Ticker</h2>

      <div className="flex flex-wrap items-center gap-1 mb-4">
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

      <div className="h-[300px]">
        <Bar
          data={{
            labels: sorted.map((e) => e.ticker),
            datasets: [
              {
                label: yLabel,
                data: chartData,
                backgroundColor: sorted.map((e) =>
                  sortKey === "btc"
                    ? e.sold > 0 && e.bought / e.sold > 0.3
                      ? "#EB0F29"
                      : "#008751"
                    : e.net >= 0
                    ? "#008751"
                    : "#EB0F29"
                ),
                borderRadius: 4,
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (ctx) =>
                    sortKey === "btc"
                      ? `${(ctx.raw as number).toFixed(1)}%`
                      : fmtMoney(ctx.raw as number),
                },
              },
            },
            scales: {
              x: { ticks: { color: mutedColor }, grid: { display: false } },
              y: {
                ticks: {
                  color: mutedColor,
                  callback: (v) =>
                    sortKey === "btc"
                      ? `${Number(v).toFixed(0)}%`
                      : "$" + (Number(v) / 1000).toFixed(0) + "K",
                },
                grid: { color: borderColor },
              },
            },
          }}
        />
      </div>
    </div>
  );
}
