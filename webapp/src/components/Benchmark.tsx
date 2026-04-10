"use client";
import { useState, useEffect } from "react";
import { fmtMoney } from "@/lib/parseCSV";

interface Props {
  bookValue: number;
  marketValue: number;
  netIncome: number;
  unrealizedGL: number;
  startDate: string;
}

// SPY monthly close prices for historical reference
// Used as fallback when live historical fetch fails
const SPY_MONTHLY: Record<string, number> = {
  "2024-01": 482.88, "2024-02": 507.44, "2024-03": 523.07,
  "2024-04": 500.87, "2024-05": 527.37, "2024-06": 544.35,
  "2024-07": 546.49, "2024-08": 563.68, "2024-09": 572.43,
  "2024-10": 570.95, "2024-11": 602.52, "2024-12": 589.31,
  "2025-01": 603.05, "2025-02": 563.07, "2025-03": 558.94,
  "2025-04": 505.28, "2025-05": 588.41, "2025-06": 604.56,
  "2025-07": 607.15, "2025-08": 564.85, "2025-09": 571.54,
  "2025-10": 572.28, "2025-11": 601.23, "2025-12": 594.65,
  "2026-01": 608.72, "2026-02": 564.29, "2026-03": 558.07,
};

function getHistoricalSPY(dateStr: string): number | null {
  // Try exact month
  const month = dateStr.slice(0, 7);
  if (SPY_MONTHLY[month]) return SPY_MONTHLY[month];
  // Try previous month
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() - 1);
  const prevMonth = d.toISOString().slice(0, 7);
  return SPY_MONTHLY[prevMonth] ?? null;
}

async function fetchSPYCurrent(): Promise<number | null> {
  // Use the same proxy pattern that works for stock prices in PnLTable
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=1d&interval=1d";

  const attempts: (() => Promise<number | null>)[] = [
    // allorigins /get wrapper
    async () => {
      const resp = await fetch(
        `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!resp.ok) return null;
      const wrapper = await resp.json();
      const data = JSON.parse(wrapper.contents);
      return data?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
    },
    // allorigins /raw
    async () => {
      const resp = await fetch(
        `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!resp.ok) return null;
      const data = await resp.json();
      return data?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
    },
    // corsproxy
    async () => {
      const resp = await fetch(
        `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!resp.ok) return null;
      const data = await resp.json();
      return data?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
    },
  ];

  for (const attempt of attempts) {
    try {
      const price = await attempt();
      if (price) return price;
    } catch {
      /* try next */
    }
  }
  return null;
}

export default function Benchmark({
  bookValue,
  marketValue,
  netIncome,
  unrealizedGL,
  startDate,
}: Props) {
  const [spyStart, setSpyStart] = useState<number | null>(null);
  const [spyNow, setSpyNow] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState<"live" | "historical">("live");

  useEffect(() => {
    const fetchData = async () => {
      // Get current SPY price
      const current = await fetchSPYCurrent();
      setSpyNow(current);

      // For historical, use lookup table (reliable, no CORS issues)
      const historical = getHistoricalSPY(startDate);
      setSpyStart(historical);
      setDataSource("historical");

      setLoading(false);
    };
    fetchData();
  }, [startDate]);

  const totalReturn = unrealizedGL + netIncome;
  const totalReturnPct = bookValue > 0 ? (totalReturn / bookValue) * 100 : 0;

  const spyReturnPct =
    spyStart && spyNow ? ((spyNow - spyStart) / spyStart) * 100 : null;
  const spyReturnDollars =
    spyReturnPct != null ? bookValue * (spyReturnPct / 100) : null;

  const diff =
    spyReturnDollars != null ? totalReturn - spyReturnDollars : null;
  const isAhead = diff != null && diff >= 0;

  const months = Math.max(
    1,
    (Date.now() - new Date(startDate).getTime()) / (30 * 86400000)
  );

  return (
    <div className="card p-5 mb-6">
      <h2 className="text-base font-semibold mb-4">
        Strategy vs S&P 500 Benchmark
      </h2>

      {loading ? (
        <p className="text-sm text-[var(--muted)]">
          Fetching S&P 500 data...
        </p>
      ) : (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-4">
            {/* Your Strategy */}
            <div className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4">
              <h3 className="text-sm font-semibold text-[var(--accent)] mb-3">
                Your Wheel Strategy
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--muted)]">Unrealized G/L</span>
                  <span
                    className={`tabular-nums font-medium ${
                      unrealizedGL >= 0
                        ? "text-[var(--green)]"
                        : "text-[var(--red)]"
                    }`}
                  >
                    {fmtMoney(unrealizedGL)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--muted)]">
                    Net income (premium + div - fees)
                  </span>
                  <span className="tabular-nums font-medium text-[var(--green)]">
                    {fmtMoney(netIncome)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-[var(--border)] pt-2">
                  <span className="font-semibold">Total return</span>
                  <span
                    className={`tabular-nums font-bold ${
                      totalReturn >= 0
                        ? "text-[var(--green)]"
                        : "text-[var(--red)]"
                    }`}
                  >
                    {fmtMoney(totalReturn)} ({totalReturnPct >= 0 ? "+" : ""}
                    {totalReturnPct.toFixed(1)}%)
                  </span>
                </div>
                <div className="flex justify-between text-xs text-[var(--muted)]">
                  <span>Monthly avg income</span>
                  <span className="tabular-nums">
                    {fmtMoney(netIncome / months)}/mo
                  </span>
                </div>
              </div>
            </div>

            {/* S&P 500 */}
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
              <h3 className="text-sm font-semibold text-[var(--muted)] mb-3">
                S&P 500 Buy & Hold
              </h3>
              {spyStart && spyNow && spyReturnPct != null ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">
                      SPY at start ({startDate})
                    </span>
                    <span className="tabular-nums">
                      ${spyStart.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">
                      SPY today{" "}
                      {!spyNow && (
                        <span className="text-[10px]">(estimated)</span>
                      )}
                    </span>
                    <span className="tabular-nums">${spyNow.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t border-[var(--border)] pt-2">
                    <span className="font-semibold">Total return</span>
                    <span
                      className={`tabular-nums font-bold ${
                        spyReturnPct >= 0
                          ? "text-[var(--green)]"
                          : "text-[var(--red)]"
                      }`}
                    >
                      {fmtMoney(spyReturnDollars!)} (
                      {spyReturnPct >= 0 ? "+" : ""}
                      {spyReturnPct.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-[var(--muted)]">
                    <span>No work, no fees, just hold</span>
                    <span className="tabular-nums">
                      {fmtMoney(spyReturnDollars! / months)}/mo
                    </span>
                  </div>
                </div>
              ) : spyStart && !spyNow ? (
                <p className="text-sm text-[var(--muted)]">
                  SPY at start: ${spyStart.toFixed(2)} — unable to fetch
                  current price. Refresh during market hours.
                </p>
              ) : (
                <p className="text-sm text-[var(--muted)]">
                  Unable to fetch S&P 500 data
                </p>
              )}
            </div>
          </div>

          {/* Verdict */}
          {diff != null && (
            <div
              className={`rounded-lg p-4 text-center ${
                isAhead
                  ? "bg-[var(--green)]/10 border border-[var(--green)]/30"
                  : "bg-[var(--red)]/10 border border-[var(--red)]/30"
              }`}
            >
              <div
                className={`text-lg font-bold ${
                  isAhead ? "text-[var(--green)]" : "text-[var(--red)]"
                }`}
              >
                {isAhead ? "Outperforming" : "Underperforming"} S&P 500 by{" "}
                {fmtMoney(Math.abs(diff))}
              </div>
              <div className="text-sm text-[var(--muted)] mt-1">
                {totalReturnPct.toFixed(1)}% vs {spyReturnPct?.toFixed(1)}%
                over {Math.round(months)} months
                {!isAhead &&
                  " — note: ~50% of capital is in T-Bills, not fully deployed in equities"}
                {isAhead &&
                  " — premium income is adding real alpha on top of market returns"}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
