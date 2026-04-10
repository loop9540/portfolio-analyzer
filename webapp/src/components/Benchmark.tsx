"use client";
import { useState, useEffect } from "react";
import { fmtMoney } from "@/lib/parseCSV";

interface Props {
  bookValue: number;
  marketValue: number;
  netIncome: number; // premium + dividends - fees
  unrealizedGL: number;
  startDate: string; // earliest transaction date (YYYY-MM-DD)
}

async function fetchSPYPrice(
  period1: number,
  period2: number
): Promise<number | null> {
  const proxies = [
    (url: string) =>
      `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url: string) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  ];

  const baseUrl = `https://query1.finance.yahoo.com/v8/finance/chart/SPY?period1=${period1}&period2=${period2}&interval=1d`;

  for (const proxyFn of proxies) {
    try {
      const resp = await fetch(proxyFn(baseUrl), {
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      const closes =
        data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
      const validCloses = closes.filter((c: number | null) => c != null);
      return validCloses.length > 0 ? validCloses[0] : null;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function fetchSPYCurrent(): Promise<number | null> {
  const proxies = [
    (url: string) =>
      `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url: string) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  ];

  const baseUrl =
    "https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=1d&interval=1d";

  for (const proxyFn of proxies) {
    try {
      const resp = await fetch(proxyFn(baseUrl), {
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      return data?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
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

  useEffect(() => {
    const fetchData = async () => {
      const startTs = Math.floor(new Date(startDate).getTime() / 1000);
      const endTs = startTs + 5 * 86400; // window for first trading day

      const [start, current] = await Promise.all([
        fetchSPYPrice(startTs, endTs),
        fetchSPYCurrent(),
      ]);

      setSpyStart(start);
      setSpyNow(current);
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
                    <span className="text-[var(--muted)]">SPY today</span>
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
                      {fmtMoney(spyReturnDollars!)} (+{spyReturnPct.toFixed(1)}
                      %)
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-[var(--muted)]">
                    <span>No work, no fees, just hold</span>
                    <span className="tabular-nums">
                      {fmtMoney(spyReturnDollars! / months)}/mo
                    </span>
                  </div>
                </div>
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
                {totalReturnPct.toFixed(1)}% vs {spyReturnPct?.toFixed(1)}% over{" "}
                {Math.round(months)} months
                {!isAhead &&
                  " — the wheel strategy underperforms in strong bull markets where upside is capped by sold calls"}
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
