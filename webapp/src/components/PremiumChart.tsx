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
  "#7D2EFF", "#008751", "#EB0F29", "#0078FF", "#9d61ff", "#06b6d4",
  "#f59e0b", "#ec4899", "#14b8a6", "#8b5cf6", "#eab308", "#5B636A",
];

export default function PremiumChart({ entries }: { entries: PremiumEntry[] }) {
  const style = getComputedStyle(document.documentElement);
  const mutedColor = style.getPropertyValue("--muted").trim() || "#979EA8";
  const borderColor = style.getPropertyValue("--border").trim() || "#374151";

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
              x: { ticks: { color: mutedColor }, grid: { display: false } },
              y: {
                ticks: {
                  color: mutedColor,
                  callback: (v) => "$" + (Number(v) / 1000).toFixed(0) + "K",
                },
                grid: { color: borderColor },
              },
            },
          }}
        />
      </div>
    </div>
  );
}
