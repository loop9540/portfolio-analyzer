"use client";
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
  "#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a78bfa", "#06b6d4",
  "#ec4899", "#f97316", "#14b8a6", "#8b5cf6", "#eab308", "#64748b",
];

export default function PremiumChart({ entries }: { entries: PremiumEntry[] }) {
  return (
    <div className="card p-5 mb-6">
      <h2 className="text-base font-semibold mb-4">Net Premium by Ticker</h2>
      <div className="h-[300px]">
        <Bar
          data={{
            labels: entries.map((e) => e.ticker),
            datasets: [
              {
                label: "Net Premium",
                data: entries.map((e) => e.net),
                backgroundColor: entries.map(
                  (_, i) => COLORS[i % COLORS.length]
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
                callbacks: { label: (ctx) => fmtMoney(ctx.raw as number) },
              },
            },
            scales: {
              x: { ticks: { color: "#8b8fa3" }, grid: { display: false } },
              y: {
                ticks: {
                  color: "#8b8fa3",
                  callback: (v) => "$" + (Number(v) / 1000).toFixed(0) + "K",
                },
                grid: { color: "#2a2d3a" },
              },
            },
          }}
        />
      </div>
    </div>
  );
}
