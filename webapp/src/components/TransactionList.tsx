"use client";
import { useState } from "react";
import { CategorizedTransaction } from "@/lib/analyze";
import { fmtMoney } from "@/lib/parseCSV";

const TABS = [
  { key: "all", label: "All" },
  { key: "options", label: "Options" },
  { key: "stocks", label: "Stocks" },
  { key: "fees", label: "Fees" },
  { key: "tbills", label: "T-Bills" },
  { key: "other", label: "Other" },
];

export default function TransactionList({
  transactions,
}: {
  transactions: CategorizedTransaction[];
}) {
  const [filter, setFilter] = useState("all");

  const filtered =
    filter === "all"
      ? transactions
      : transactions.filter((t) => t._category === filter);

  return (
    <div className="card p-5 mb-6">
      <h2 className="text-base font-semibold mb-4">All Transactions</h2>
      <div className="flex gap-1 mb-4">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
              filter === tab.key
                ? "bg-[var(--border)] text-[var(--text)]"
                : "text-[var(--muted)] hover:text-[var(--text)]"
            }`}
            onClick={() => setFilter(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="max-h-[400px] overflow-y-auto space-y-0">
        {filtered.map((t, i) => {
          const amt = t._amount;
          return (
            <div
              key={i}
              className="flex justify-between items-center py-2 border-b border-[var(--border)] last:border-b-0 text-sm"
            >
              <span className="text-[var(--muted)] text-xs min-w-[80px]">
                {t.Processed}
              </span>
              <span className="flex-1 mx-3">
                {t["Tran Types"]}{" "}
                {t.Symbol && (
                  <span className="ticker-badge mr-1">{t.Symbol}</span>
                )}
                {t.Description}
              </span>
              <span
                className={`font-semibold tabular-nums ${
                  amt > 0
                    ? "text-[var(--green)]"
                    : amt < 0
                    ? "text-[var(--red)]"
                    : ""
                }`}
              >
                {amt !== 0 ? fmtMoney(amt) : "-"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
