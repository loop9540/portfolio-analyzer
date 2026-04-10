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

async function fetchYahooChart(url: string): Promise<Record<string, unknown> | null> {
  // Try multiple proxy strategies
  const attempts: (() => Promise<Response>)[] = [
    // allorigins /get wrapper (returns {contents: "json string"})
    () =>
      fetch(
        `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
        { signal: AbortSignal.timeout(10000) }
      ),
    // allorigins /raw
    () =>
      fetch(
        `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        { signal: AbortSignal.timeout(10000) }
      ),
    // corsproxy
    () =>
      fetch(`https://corsproxy.io/?url=${encodeURIComponent(url)}`, {
        signal: AbortSignal.timeout(10000),
      }),
  ];

  for (const attempt of attempts) {
    try {
      const resp = await attempt();
      if (!resp.ok) continue;
      const raw = await resp.json();
      // allorigins /get wraps in {contents: "..."}
      if (raw.contents) {
        return JSON.parse(raw.contents);
      }
      return raw;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function fetchSPYPrice(
  period1: number,
  period2: number
): Promise<number | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/SPY?period1=${period1}&period2=${period2}&interval=1d`;
  const data = await fetchYahooChart(url);
  if (!data) return null;
  const closes =
    (data as Record<string, unknown> & { chart?: { result?: { indicators?: { quote?: { close?: number[] }[] } }[] } })
      ?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
  const validCloses = (closes as (number | null)[]).filter((c) => c != null);
  return validCloses.length > 0 ? validCloses[0] : null;
}

async function fetchSPYCurrent(): Promise<number | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=1d&interval=1d`;
  const data = await fetchYahooChart(url);
  if (!data) return null;
  return (
    (data as Record<string, unknown> & { chart?: { result?: { meta?: { regularMarketPrice?: number } }[] } })
      ?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null
  );
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
      const endTs = startTs + 5 * 86400;

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
