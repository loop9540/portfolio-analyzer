"use client";
import { useState } from "react";

export type TimeframeKey = "all" | "ytd" | "6m" | "3m" | "1m" | "custom";

interface Props {
  dateRange: { min: string; max: string };
  selected: TimeframeKey;
  customStart: string;
  customEnd: string;
  onSelect: (key: TimeframeKey) => void;
  onCustomChange: (start: string, end: string) => void;
}

const PRESETS: { key: TimeframeKey; label: string }[] = [
  { key: "all", label: "All Time" },
  { key: "ytd", label: "YTD" },
  { key: "6m", label: "6M" },
  { key: "3m", label: "3M" },
  { key: "1m", label: "1M" },
  { key: "custom", label: "Custom" },
];

export function getDateRange(
  key: TimeframeKey,
  dataMin: string,
  dataMax: string,
  customStart: string,
  customEnd: string
): { start: string; end: string } {
  if (key === "custom") {
    return { start: customStart || dataMin, end: customEnd || dataMax };
  }
  if (key === "all") {
    return { start: dataMin, end: dataMax };
  }

  const end = new Date(dataMax);
  const start = new Date(dataMax);

  switch (key) {
    case "ytd":
      start.setMonth(0, 1);
      break;
    case "6m":
      start.setMonth(start.getMonth() - 6);
      break;
    case "3m":
      start.setMonth(start.getMonth() - 3);
      break;
    case "1m":
      start.setMonth(start.getMonth() - 1);
      break;
  }

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export default function TimeframeFilter({
  dateRange,
  selected,
  customStart,
  customEnd,
  onSelect,
  onCustomChange,
}: Props) {
  const [showCustom, setShowCustom] = useState(selected === "custom");

  return (
    <div className="mb-6">
      <div className="flex items-center gap-1 flex-wrap">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => {
              onSelect(p.key);
              setShowCustom(p.key === "custom");
            }}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              selected === p.key
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {p.label}
          </button>
        ))}
        <span className="text-xs text-[var(--muted)] ml-3">
          Data: {dateRange.min} to {dateRange.max}
        </span>
      </div>
      {showCustom && (
        <div className="flex items-center gap-2 mt-3">
          <input
            type="date"
            value={customStart || dateRange.min}
            min={dateRange.min}
            max={customEnd || dateRange.max}
            onChange={(e) =>
              onCustomChange(e.target.value, customEnd || dateRange.max)
            }
            className="bg-[var(--card)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
          />
          <span className="text-[var(--muted)] text-sm">to</span>
          <input
            type="date"
            value={customEnd || dateRange.max}
            min={customStart || dateRange.min}
            max={dateRange.max}
            onChange={(e) =>
              onCustomChange(customStart || dateRange.min, e.target.value)
            }
            className="bg-[var(--card)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}
