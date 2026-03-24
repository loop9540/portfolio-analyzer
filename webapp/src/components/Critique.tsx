"use client";
import { AnalysisResult } from "@/lib/analyze";
import { HoldingsData } from "@/lib/parseHoldings";
import { fmtMoney } from "@/lib/parseCSV";

interface Insight {
  type: "positive" | "warning" | "suggestion";
  title: string;
  detail: string;
}

function generateInsights(data: AnalysisResult, holdings?: HoldingsData): Insight[] {
  const insights: Insight[] = [];
  const {
    premiumEntries,
    totalSold,
    totalBought,
    totalNet,
    totalMgmtFees,
    totalGST,
    totalDividends,
    totalWithholding,
    assignmentDetails,
    positions,
    transactions,
  } = data;

  // 1. Buy-to-close ratio
  const btcRatio = totalBought / totalSold;
  if (btcRatio > 0.3) {
    insights.push({
      type: "warning",
      title: `High buy-to-close ratio: ${(btcRatio * 100).toFixed(0)}%`,
      detail: `You spent ${fmtMoney(totalBought)} buying back options out of ${fmtMoney(totalSold)} sold. Consider letting more contracts expire worthless or rolling closer to expiration to retain more premium.`,
    });
  } else if (btcRatio < 0.15) {
    insights.push({
      type: "positive",
      title: `Strong premium retention: ${((1 - btcRatio) * 100).toFixed(0)}%`,
      detail: `Only ${fmtMoney(totalBought)} bought to close out of ${fmtMoney(totalSold)} sold. You're keeping most of the premium collected.`,
    });
  }

  // 2. Ticker concentration
  if (premiumEntries.length > 0) {
    const topTicker = premiumEntries[0];
    const topPct = (topTicker.net / totalNet) * 100;
    if (topPct > 40) {
      insights.push({
        type: "warning",
        title: `Concentrated in ${topTicker.ticker}: ${topPct.toFixed(0)}% of premium`,
        detail: `Heavy concentration in a single ticker increases risk. Consider diversifying across more underlyings to reduce exposure to a single stock move.`,
      });
    }
  }

  // 3. Underperforming tickers (negative or very low net)
  const losers = premiumEntries.filter((e) => e.net < 0);
  if (losers.length > 0) {
    insights.push({
      type: "warning",
      title: `${losers.length} ticker${losers.length > 1 ? "s" : ""} with negative net premium`,
      detail: `${losers.map((l) => `${l.ticker} (${fmtMoney(l.net)})`).join(", ")}. You're spending more to close these than you collected. Consider avoiding these underlyings or adjusting strike selection.`,
    });
  }

  // 4. Assignment analysis
  const assignedTickers = [...new Set(assignmentDetails.map((a) => a.ticker))];
  if (assignedTickers.length > 0) {
    const totalAssignedCost = assignmentDetails.reduce(
      (s, a) => s + a.cost,
      0
    );
    insights.push({
      type: "suggestion",
      title: `${assignedTickers.length} ticker${assignedTickers.length > 1 ? "s" : ""} assigned — ${fmtMoney(totalAssignedCost)} capital tied up`,
      detail: `Assigned positions in ${assignedTickers.join(", ")} are locking up capital. Sell covered calls against these to generate additional income while waiting for recovery. Target strikes at or above your cost basis.`,
    });
  }

  // 5. Fee drag
  const totalFees = totalMgmtFees + totalGST;
  const feePct = totalNet > 0 ? (totalFees / totalNet) * 100 : 0;
  if (feePct > 10) {
    insights.push({
      type: "warning",
      title: `Fees consuming ${feePct.toFixed(0)}% of option premium`,
      detail: `Management fees (${fmtMoney(totalMgmtFees)}) + GST (${fmtMoney(totalGST)}) = ${fmtMoney(totalFees)}. This is a significant drag on returns. Evaluate whether the managed account fees are justified by the performance.`,
    });
  }

  // 6. Withholding tax on dividends
  if (totalWithholding > 0 && totalDividends > 0) {
    const withholdPct = (totalWithholding / totalDividends) * 100;
    insights.push({
      type: "suggestion",
      title: `${withholdPct.toFixed(0)}% dividend withholding tax`,
      detail: `${fmtMoney(totalWithholding)} withheld on ${fmtMoney(totalDividends)} in dividends. Ensure you're claiming foreign tax credits on your return. Consider whether dividend-paying underlyings are optimal for a non-US account.`,
    });
  }

  // 7. Premium per ticker efficiency — factor in unrealized G/L when holdings available
  if (holdings) {
    const equityMap = new Map(
      holdings.equities.map((e) => [e.symbol.trim().toUpperCase(), e])
    );
    const truePnlByTicker = premiumEntries.map((e) => {
      const eq = equityMap.get(e.ticker);
      const unrealized = eq?.gl ?? 0;
      return { ticker: e.ticker, net: e.net, unrealized, truePnL: e.net + unrealized };
    });

    const trueWinners = truePnlByTicker
      .filter((t) => t.truePnL > 500)
      .sort((a, b) => b.truePnL - a.truePnL);
    const trueLosers = truePnlByTicker
      .filter((t) => t.truePnL < 0)
      .sort((a, b) => a.truePnL - b.truePnL);

    if (trueWinners.length > 0) {
      insights.push({
        type: "positive",
        title: `True top performers: ${trueWinners.map((t) => t.ticker).join(", ")}`,
        detail: `Factoring in both premium collected AND unrealized G/L: ${trueWinners.map((t) => `${t.ticker} (${fmtMoney(t.truePnL)} = ${fmtMoney(t.net)} premium ${t.unrealized >= 0 ? "+" : ""}${fmtMoney(t.unrealized)} unrealized)`).join(", ")}. These are your genuinely profitable positions.`,
      });
    }
    if (trueLosers.length > 0) {
      insights.push({
        type: "warning",
        title: `True underperformers: ${trueLosers.map((t) => t.ticker).join(", ")}`,
        detail: `Despite premium collected, these positions are net negative when including unrealized losses: ${trueLosers.map((t) => `${t.ticker} (${fmtMoney(t.truePnL)} = ${fmtMoney(t.net)} premium ${t.unrealized >= 0 ? "+" : ""}${fmtMoney(t.unrealized)} unrealized)`).join(", ")}. Consider whether to continue wheeling these or cut losses.`,
      });
    }
  } else {
    // Fallback: premium-only analysis when no holdings data
    const highEfficiency = premiumEntries.filter(
      (e) => e.sold > 0 && e.bought / e.sold < 0.1 && e.net > 500
    );
    if (highEfficiency.length > 0) {
      insights.push({
        type: "positive",
        title: `Top performers: ${highEfficiency.map((e) => e.ticker).join(", ")}`,
        detail: `These tickers have high premium retention (>90%) and generated strong net income. Consider increasing allocation to these underlyings. Upload Holdings CSV for true P&L including unrealized gains/losses.`,
      });
    }
  }

  // 8. Small premium tickers (not worth the effort)
  const smallFish = premiumEntries.filter(
    (e) => e.net > 0 && e.net < 200 && e.sold > 0
  );
  if (smallFish.length >= 3) {
    insights.push({
      type: "suggestion",
      title: `${smallFish.length} tickers generating less than $200 net each`,
      detail: `${smallFish.map((e) => `${e.ticker} (${fmtMoney(e.net)})`).join(", ")}. Small positions add complexity without meaningful income. Consider consolidating into fewer, higher-premium underlyings.`,
    });
  }

  // 9. Number of trades (overtrading check)
  const optionTrades = transactions.filter((t) => t._category === "options");
  if (optionTrades.length > 100) {
    insights.push({
      type: "warning",
      title: `${optionTrades.length} option transactions — possible overtrading`,
      detail: `High transaction count increases commission costs and management complexity. Consider using fewer, larger positions with longer DTEs to reduce churn.`,
    });
  }

  return insights;
}

interface Optimization {
  category: string;
  actions: string[];
}

function generateOptimizations(data: AnalysisResult): Optimization[] {
  const {
    premiumEntries,
    totalSold,
    totalBought,
    totalNet,
    totalMgmtFees,
    totalGST,
    assignmentDetails,
    positions,
    transactions,
  } = data;

  const optimizations: Optimization[] = [];
  const btcRatio = totalSold > 0 ? totalBought / totalSold : 0;
  const totalFees = totalMgmtFees + totalGST;
  const assignedTickers = [...new Set(assignmentDetails.map((a) => a.ticker))];
  const optionTrades = transactions.filter((t) => t._category === "options");

  // Capital efficiency
  const capitalActions: string[] = [];
  const totalAssignedCost = assignmentDetails.reduce((s, a) => s + a.cost, 0);
  if (assignedTickers.length > 0) {
    capitalActions.push(
      `Sell covered calls on assigned positions (${assignedTickers.join(", ")}) to generate ${fmtMoney(totalAssignedCost * 0.02)}–${fmtMoney(totalAssignedCost * 0.04)}/month in additional premium`
    );
    capitalActions.push(
      "Set call strikes at or above cost basis to avoid locking in losses on assignment"
    );
  }
  capitalActions.push(
    "Park idle cash in T-Bills or money market between trades — even 1 week of idle cash at scale costs premium"
  );
  capitalActions.push(
    "Size positions to use 60–70% of available capital, keeping 30–40% for rolling or new opportunities during dips"
  );
  optimizations.push({ category: "Capital Efficiency", actions: capitalActions });

  // Strike & expiry selection
  const strikeActions: string[] = [
    "Sell puts at 0.20–0.30 delta (70–80% OTM) — this balances premium collected vs. assignment risk",
    "Target 30–45 DTE to capture the steepest part of the theta decay curve",
    "Avoid weeklies unless IV is elevated — the risk/reward ratio is poor at <14 DTE",
  ];
  if (btcRatio > 0.2) {
    strikeActions.push(
      `Your ${(btcRatio * 100).toFixed(0)}% buy-to-close rate suggests strikes may be too aggressive — move further OTM to reduce the need to close early`
    );
  }
  // Check for tickers with high bought-to-sold ratio
  const highBtcTickers = premiumEntries.filter(
    (e) => e.sold > 0 && e.bought / e.sold > 0.4
  );
  if (highBtcTickers.length > 0) {
    strikeActions.push(
      `Widen strikes on: ${highBtcTickers.map((e) => `${e.ticker} (${((e.bought / e.sold) * 100).toFixed(0)}% BTC)`).join(", ")}`
    );
  }
  optimizations.push({ category: "Strike & Expiry Selection", actions: strikeActions });

  // Trade management
  const mgmtActions: string[] = [
    "Close winning trades at 50% of max profit — frees capital and reduces gamma risk in the last 2 weeks",
    "Roll losing puts down and out (lower strike, further expiry) instead of taking assignment when possible",
    "Set GTC limit orders to auto-close at 50% profit immediately after opening a position",
  ];
  if (optionTrades.length > 80) {
    const tradesPerTicker = optionTrades.length / Math.max(premiumEntries.length, 1);
    mgmtActions.push(
      `Averaging ${tradesPerTicker.toFixed(0)} trades per ticker — reduce churn by using larger single positions instead of multiple small ones`
    );
  }
  optimizations.push({ category: "Trade Management", actions: mgmtActions });

  // Diversification
  const divActions: string[] = [];
  if (premiumEntries.length < 5) {
    divActions.push(
      `Only ${premiumEntries.length} underlyings — expand to 5–8 across different sectors to reduce correlation risk`
    );
  } else if (premiumEntries.length > 12) {
    divActions.push(
      `${premiumEntries.length} underlyings is over-diversified for a wheel strategy — consolidate to your top 6–8 performers for better focus`
    );
  }
  // Top ticker concentration
  if (premiumEntries.length > 0) {
    const topPct = (premiumEntries[0].net / totalNet) * 100;
    if (topPct > 30) {
      divActions.push(
        `Cap individual ticker allocation at 20–25% of premium to limit single-stock blow-up risk`
      );
    }
  }
  divActions.push(
    "Spread across sectors: aim for at least 3 different industries (e.g., industrials, energy, financials, tech)"
  );
  divActions.push(
    "Avoid running multiple put positions on correlated stocks (e.g., two steel companies) — a sector downturn assigns all at once"
  );
  optimizations.push({ category: "Diversification", actions: divActions });

  // Fee optimization
  if (totalFees > 0) {
    const feeActions: string[] = [];
    const feePct = totalNet > 0 ? (totalFees / totalNet) * 100 : 0;
    feeActions.push(
      `Current fee drag: ${fmtMoney(totalFees)} (${feePct.toFixed(1)}% of net premium) — benchmark this against self-managed accounts at $0.65/contract`
    );
    const selfMgdCost = optionTrades.length * 0.65;
    if (selfMgdCost < totalFees * 0.5) {
      feeActions.push(
        `Self-managed commissions would be ~${fmtMoney(selfMgdCost)} vs. ${fmtMoney(totalFees)} in fees — a potential ${fmtMoney(totalFees - selfMgdCost)} annual saving`
      );
    }
    feeActions.push(
      "If staying managed, negotiate a performance-based fee structure (e.g., 1% base + 10% of profits above benchmark)"
    );
    optimizations.push({ category: "Fee Optimization", actions: feeActions });
  }

  // Income scaling
  const scaleActions: string[] = [
    `Current net premium: ${fmtMoney(totalNet)}. To scale, increase contract size on your top 3–5 performers rather than adding new tickers`,
    "Sell strangles (put + call) on stable underlyings to collect premium on both sides when IV is elevated",
    "Layer expiration dates (stagger 30, 37, 45 DTE) to create consistent weekly income instead of lumpy monthly cycles",
    "Reinvest premium into selling additional contracts — compounding at even 2%/month turns ${fmtMoney(totalNet)} into significantly more over 12 months",
  ];
  optimizations.push({ category: "Scaling Income", actions: scaleActions });

  return optimizations;
}

const ICONS = {
  positive: "✓",
  warning: "!",
  suggestion: "→",
};

const COLORS = {
  positive: {
    border: "border-[var(--green)]/30",
    bg: "bg-[var(--green)]/10",
    icon: "text-[var(--green)] bg-[var(--green)]/20",
  },
  warning: {
    border: "border-[color:orange]/30",
    bg: "bg-[color:orange]/10",
    icon: "text-[color:orange] bg-[color:orange]/20",
  },
  suggestion: {
    border: "border-[var(--accent)]/30",
    bg: "bg-[var(--accent)]/10",
    icon: "text-[var(--accent)] bg-[var(--accent)]/20",
  },
};

export default function Critique({ data, holdings }: { data: AnalysisResult; holdings?: HoldingsData }) {
  const insights = generateInsights(data, holdings);
  const optimizations = generateOptimizations(data);

  return (
    <div className="space-y-6 mb-6">
      <div className="card p-5">
        <h2 className="text-base font-semibold mb-4">
          Portfolio Critique
        </h2>
        <div className="space-y-3">
          {insights.map((insight, i) => {
            const c = COLORS[insight.type];
            return (
              <div
                key={i}
                className={`rounded-lg border ${c.border} ${c.bg} p-4`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${c.icon}`}
                  >
                    {ICONS[insight.type]}
                  </span>
                  <div>
                    <div className="font-semibold text-sm mb-1">
                      {insight.title}
                    </div>
                    <div className="text-sm text-[var(--muted)] leading-relaxed">
                      {insight.detail}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card p-5">
        <h2 className="text-base font-semibold mb-4">
          Optimization Playbook
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {optimizations.map((opt, i) => (
            <div
              key={i}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4"
            >
              <h3 className="text-sm font-semibold text-[var(--accent)] mb-3">
                {opt.category}
              </h3>
              <ul className="space-y-2">
                {opt.actions.map((action, j) => (
                  <li key={j} className="flex items-start gap-2 text-sm">
                    <span className="text-[var(--accent)] mt-0.5 flex-shrink-0">
                      &bull;
                    </span>
                    <span className="text-[var(--muted)] leading-relaxed">
                      {action}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
