"use client";
import { fmtMoney } from "@/lib/parseCSV";
import { AnalysisResult } from "@/lib/analyze";

export default function KPIRow({ data }: { data: AnalysisResult }) {
  const netDividends = data.totalDividends - data.totalWithholding;
  const totalFees = data.totalMgmtFees + data.totalGST;
  const totalIncome =
    data.totalNet + netDividends + Math.max(data.totalInterest, 0);
  const netAfterFees = totalIncome - totalFees;

  const kpis = [
    { label: "Total Income", value: fmtMoney(totalIncome), positive: true },
    { label: "Total Fees", value: fmtMoney(-totalFees), positive: false },
    {
      label: "Net After Fees",
      value: fmtMoney(netAfterFees),
      positive: netAfterFees >= 0,
    },
    { label: "Options Premium", value: fmtMoney(data.totalNet), positive: true },
    { label: "Dividends (Net)", value: fmtMoney(netDividends), positive: true },
    {
      label: "Bought to Close",
      value: fmtMoney(-data.totalBought),
      positive: false,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
      {kpis.map((k) => (
        <div key={k.label} className="card p-4">
          <div className="text-xs uppercase tracking-wide text-[var(--muted)] mb-1">
            {k.label}
          </div>
          <div
            className={`text-xl font-bold tabular-nums ${
              k.positive ? "text-green-500" : "text-red-500"
            }`}
          >
            {k.value}
          </div>
        </div>
      ))}
    </div>
  );
}
