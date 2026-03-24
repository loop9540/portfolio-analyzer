"use client";
import { useState } from "react";
import { HoldingsData, parseOptionHolding } from "@/lib/parseHoldings";
import { fmtMoney } from "@/lib/parseCSV";
import {
  fetchFullOptionChain,
  OptionChainData,
  OptionContract,
} from "@/lib/optionChain";

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

export default function HoldingsDashboard({ data }: { data: HoldingsData }) {
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);

  const totalEquityValue = data.equities.reduce(
    (s, e) => s + e.marketValue,
    0
  );
  const totalEquityGL = data.equities.reduce((s, e) => s + e.gl, 0);
  const totalOptionsGL = data.options.reduce((s, e) => s + e.gl, 0);
  const totalTBillValue = data.tbills.reduce((s, e) => s + e.marketValue, 0);

  const parsedOptions = data.options
    .map(parseOptionHolding)
    .filter((o) => o !== null);
  const puts = parsedOptions.filter((o) => o.type === "PUT");
  const calls = parsedOptions.filter((o) => o.type === "CALL");

  const totalPutExposure = puts.reduce(
    (s, p) => s + p.strike * p.contracts * 100,
    0
  );

  return (
    <div>
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {[
          {
            label: "Portfolio Value",
            value: fmtMoney(data.totalMarketValue),
            positive: true,
          },
          {
            label: "Total G/L",
            value: fmtMoney(data.totalGL),
            positive: data.totalGL >= 0,
          },
          {
            label: "Equity Value",
            value: fmtMoney(totalEquityValue),
            positive: true,
          },
          {
            label: "Equity G/L",
            value: fmtMoney(totalEquityGL),
            positive: totalEquityGL >= 0,
          },
          {
            label: "Cash + T-Bills",
            value: fmtMoney(data.cashBalance + totalTBillValue),
            positive: true,
          },
          {
            label: "Put Exposure",
            value: fmtMoney(totalPutExposure),
            positive: false,
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
          </div>
        ))}
      </div>

      {/* Equity Holdings with Trade Suggest */}
      <div className="card p-5 mb-6">
        <h2 className="text-base font-semibold mb-4">
          Equity Holdings
        </h2>
        <div className="max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                {[
                  "Ticker",
                  "Holding",
                  "Shares",
                  "Avg Cost",
                  "Price",
                  "Book Value",
                  "Market Value",
                  "G/L",
                  "G/L %",
                  "",
                ].map((h, i) => (
                  <th
                    key={h + i}
                    className={`${
                      i <= 1
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
              {data.equities
                .sort((a, b) => b.marketValue - a.marketValue)
                .map((e) => (
                  <>
                    <tr key={e.symbol}>
                      <td className="p-2 border-b border-[var(--border)]">
                        <span className="ticker-badge">{e.symbol}</span>
                      </td>
                      <td className="p-2 border-b border-[var(--border)] text-xs text-[var(--muted)] max-w-[150px] truncate">
                        {e.holding}
                      </td>
                      <td className="text-right tabular-nums p-2 border-b border-[var(--border)]">
                        {e.quantity.toLocaleString()}
                      </td>
                      <td className="text-right tabular-nums p-2 border-b border-[var(--border)]">
                        ${e.averageCost.toFixed(2)}
                      </td>
                      <td className="text-right tabular-nums p-2 border-b border-[var(--border)]">
                        ${e.price.toFixed(2)}
                      </td>
                      <td className="text-right tabular-nums p-2 border-b border-[var(--border)]">
                        {fmtMoney(e.bookValue)}
                      </td>
                      <td className="text-right tabular-nums p-2 border-b border-[var(--border)]">
                        {fmtMoney(e.marketValue)}
                      </td>
                      <td
                        className={`text-right tabular-nums p-2 border-b border-[var(--border)] ${
                          e.gl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"
                        }`}
                      >
                        {fmtMoney(e.gl)}
                      </td>
                      <td
                        className={`text-right tabular-nums p-2 border-b border-[var(--border)] ${
                          e.glPct >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"
                        }`}
                      >
                        {e.glPct.toFixed(1)}%
                      </td>
                      <td className="text-center p-2 border-b border-[var(--border)]">
                        <button
                          onClick={() =>
                            setExpandedTicker(
                              expandedTicker === e.symbol ? null : e.symbol
                            )
                          }
                          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                            expandedTicker === e.symbol
                              ? "bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30"
                              : "bg-[var(--border)] text-[var(--text)] hover:bg-[var(--accent)]/20 hover:text-[var(--accent)]"
                          }`}
                        >
                          Trade Suggest
                        </button>
                      </td>
                    </tr>
                    {expandedTicker === e.symbol && (
                      <tr key={e.symbol + "-suggest"}>
                        <td
                          colSpan={10}
                          className="p-0 border-b border-[var(--border)]"
                        >
                          <HoldingTradeSuggest
                            ticker={e.symbol}
                            currentPrice={e.price}
                            avgCost={e.averageCost}
                            shares={e.quantity}
                            unrealizedLoss={e.gl < 0 ? Math.abs(e.gl) : 0}
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
                <td></td>
                <td className="text-right tabular-nums p-2">
                  {fmtMoney(
                    data.equities.reduce((s, e) => s + e.bookValue, 0)
                  )}
                </td>
                <td className="text-right tabular-nums p-2">
                  {fmtMoney(totalEquityValue)}
                </td>
                <td
                  className={`text-right tabular-nums p-2 ${
                    totalEquityGL >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"
                  }`}
                >
                  {fmtMoney(totalEquityGL)}
                </td>
                <td></td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Open Options */}
      <div className="card p-5 mb-6">
        <h2 className="text-base font-semibold mb-4">Open Options</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Puts */}
          <div>
            <h3 className="text-sm font-medium text-[var(--muted)] mb-3 uppercase tracking-wide">
              Puts Sold ({puts.length})
            </h3>
            <div className="space-y-2">
              {puts.map((p, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="ticker-badge">{p.ticker}</span>
                    <span
                      className={`text-xs font-semibold ${
                        p.gl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"
                      }`}
                    >
                      {fmtMoney(p.gl)} ({p.glPct > 0 ? "+" : ""}
                      {p.glPct.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="text-xs text-[var(--muted)]">
                    {p.contracts}x ${p.strike} PUT — Exp {p.expiry}
                  </div>
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-[var(--muted)]">
                      Sold @ ${p.avgCost.toFixed(2)} / Now ${p.price.toFixed(2)}
                    </span>
                    <span className="text-[var(--muted)]">
                      Exposure: {fmtMoney(p.strike * p.contracts * 100)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Calls */}
          <div>
            <h3 className="text-sm font-medium text-[var(--muted)] mb-3 uppercase tracking-wide">
              Calls Sold ({calls.length})
            </h3>
            <div className="space-y-2">
              {calls.map((c, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="ticker-badge">{c.ticker}</span>
                    <span
                      className={`text-xs font-semibold ${
                        c.gl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"
                      }`}
                    >
                      {fmtMoney(c.gl)} ({c.glPct > 0 ? "+" : ""}
                      {c.glPct.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="text-xs text-[var(--muted)]">
                    {c.contracts}x ${c.strike} CALL — Exp {c.expiry}
                  </div>
                  <div className="text-xs text-[var(--muted)] mt-1">
                    Sold @ ${c.avgCost.toFixed(2)} / Now ${c.price.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* T-Bills */}
      {data.tbills.length > 0 && (
        <div className="card p-5 mb-6">
          <h2 className="text-base font-semibold mb-4">T-Bills</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                {["Holding", "Face Value", "Price", "Book Value", "Market Value", "G/L"].map(
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
              {data.tbills.map((t, i) => (
                <tr key={i}>
                  <td className="p-2 border-b border-[var(--border)]">
                    {t.holding}
                  </td>
                  <td className="text-right tabular-nums p-2 border-b border-[var(--border)]">
                    {fmtMoney(t.quantity)}
                  </td>
                  <td className="text-right tabular-nums p-2 border-b border-[var(--border)]">
                    ${t.price.toFixed(2)}
                  </td>
                  <td className="text-right tabular-nums p-2 border-b border-[var(--border)]">
                    {fmtMoney(t.bookValue)}
                  </td>
                  <td className="text-right tabular-nums p-2 border-b border-[var(--border)]">
                    {fmtMoney(t.marketValue)}
                  </td>
                  <td
                    className={`text-right tabular-nums p-2 border-b border-[var(--border)] ${
                      t.gl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"
                    }`}
                  >
                    {fmtMoney(t.gl)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function HoldingTradeSuggest({
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

  if (contracts === 0) {
    return (
      <div className="bg-[var(--accent)]/5 border-t border-[var(--accent)]/20 p-4">
        <p className="text-sm text-[var(--muted)]">
          Less than 100 shares — cannot sell covered calls.
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
    : [7, 30, 45].map((d) => Math.floor(now) + d * 86400);

  const sections = expirations.map((exp) => {
    const dte = Math.max(Math.round((exp - now) / 86400), 1);
    const expDate = new Date(exp * 1000);
    const label =
      dte <= 10 ? "Weekly" : dte <= 35 ? "Monthly (~30 DTE)" : "45 DTE";
    const expLabel = `${label} — ${expDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

    const liveCalls = isLive ? chainData.calls[exp] || [] : [];

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

    const seen = new Set<number>();
    const uniqueStrikes = targetStrikes.filter((s) => {
      if (seen.has(s.target)) return false;
      seen.add(s.target);
      return true;
    });

    const cards = uniqueStrikes.map((ts) => {
      let liveMatch: OptionContract | null = null;
      if (liveCalls.length > 0) {
        liveMatch = liveCalls.reduce((best, c) =>
          Math.abs(c.strike - ts.target) < Math.abs(best.strike - ts.target)
            ? c
            : best
        );
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
      const isLivePrice =
        liveMatch != null && (liveMatch.lastPrice > 0 || liveMatch.bid > 0);

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

    const isRealExp = isLive && chainData.expirations.includes(exp);
    return { expLabel, dte, cards, expTimestamp: exp, isRealExp };
  });

  const monthlySection = sections.find((s) => s.dte >= 25 && s.dte <= 40);
  const monthlyIncome =
    monthlySection?.cards[1]?.totalIncome ??
    monthlySection?.cards[0]?.totalIncome ??
    0;
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
          const chainUrl = `https://www.barchart.com/stocks/quotes/${ticker}/options?expiration=${new Date(expTimestamp * 1000).toISOString().slice(0, 10)}`;
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
