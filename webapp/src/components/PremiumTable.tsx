"use client";
import { PremiumEntry } from "@/lib/analyze";
import { fmtMoney } from "@/lib/parseCSV";

export default function PremiumTable({
  entries,
}: {
  entries: PremiumEntry[];
}) {
  const totalSold = entries.reduce((s, e) => s + e.sold, 0);
  const totalBought = entries.reduce((s, e) => s + e.bought, 0);
  const totalNet = totalSold - totalBought;

  return (
    <div className="card p-5">
      <h2 className="text-base font-semibold mb-4">Premium Breakdown</h2>
      <div className="max-h-[500px] overflow-y-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="text-left text-[var(--muted)] text-xs uppercase tracking-wide p-2 border-b border-[var(--border)]">Ticker</th>
              <th className="text-right text-[var(--muted)] text-xs uppercase tracking-wide p-2 border-b border-[var(--border)]">Sold</th>
              <th className="text-right text-[var(--muted)] text-xs uppercase tracking-wide p-2 border-b border-[var(--border)]">Bought</th>
              <th className="text-right text-[var(--muted)] text-xs uppercase tracking-wide p-2 border-b border-[var(--border)]">Net</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.ticker}>
                <td className="p-2 border-b border-[var(--border)]">
                  <span className="ticker-badge">{e.ticker}</span>
                </td>
                <td className="text-right tabular-nums text-green-500 p-2 border-b border-[var(--border)]">
                  {fmtMoney(e.sold)}
                </td>
                <td className="text-right tabular-nums text-red-500 p-2 border-b border-[var(--border)]">
                  {fmtMoney(-e.bought)}
                </td>
                <td
                  className={`text-right tabular-nums p-2 border-b border-[var(--border)] ${
                    e.net >= 0 ? "text-green-500" : "text-red-500"
                  }`}
                >
                  {fmtMoney(e.net)}
                </td>
              </tr>
            ))}
            <tr className="font-bold border-t-2 border-[var(--border)]">
              <td className="p-2">TOTAL</td>
              <td className="text-right tabular-nums text-green-500 p-2">
                {fmtMoney(totalSold)}
              </td>
              <td className="text-right tabular-nums text-red-500 p-2">
                {fmtMoney(-totalBought)}
              </td>
              <td className="text-right tabular-nums text-green-500 p-2">
                {fmtMoney(totalNet)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
