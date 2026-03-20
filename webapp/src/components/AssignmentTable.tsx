"use client";
import { AssignmentDetail } from "@/lib/analyze";
import { fmtMoney } from "@/lib/parseCSV";

export default function AssignmentTable({
  assignments,
}: {
  assignments: AssignmentDetail[];
}) {
  return (
    <div className="card p-5">
      <h2 className="text-base font-semibold mb-4">Stock Assignments</h2>
      <div className="max-h-[500px] overflow-y-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="text-left text-[var(--muted)] text-xs uppercase tracking-wide p-2 border-b border-[var(--border)]">Ticker</th>
              <th className="text-right text-[var(--muted)] text-xs uppercase tracking-wide p-2 border-b border-[var(--border)]">Shares</th>
              <th className="text-right text-[var(--muted)] text-xs uppercase tracking-wide p-2 border-b border-[var(--border)]">Cost Basis</th>
              <th className="text-left text-[var(--muted)] text-xs uppercase tracking-wide p-2 border-b border-[var(--border)]">Date</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a, i) => (
              <tr key={i}>
                <td className="p-2 border-b border-[var(--border)]">
                  <span className="ticker-badge">{a.ticker}</span>
                </td>
                <td className="text-right tabular-nums p-2 border-b border-[var(--border)]">
                  {a.shares.toLocaleString()}
                </td>
                <td className="text-right tabular-nums p-2 border-b border-[var(--border)]">
                  {fmtMoney(a.cost)}
                </td>
                <td className="text-[var(--muted)] p-2 border-b border-[var(--border)]">
                  {a.date}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
