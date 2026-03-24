"use client";
import { useState, useEffect, useMemo } from "react";
import { parseCSV, Transaction } from "@/lib/parseCSV";
import { analyze, AnalysisResult } from "@/lib/analyze";
import {
  parseHoldings,
  isHoldingsCSV,
  HoldingsData,
} from "@/lib/parseHoldings";
import UploadZone from "@/components/UploadZone";
import Dashboard from "@/components/Dashboard";
import HoldingsDashboard from "@/components/HoldingsDashboard";
import TimeframeFilter, {
  TimeframeKey,
  getDateRange,
} from "@/components/TimeframeFilter";

type RawData =
  | { type: "activities"; rows: Transaction[]; text: string }
  | { type: "holdings"; data: HoldingsData; text: string };

export default function Home() {
  const [raw, setRaw] = useState<RawData | null>(null);
  const [dark, setDark] = useState(true);
  const [timeframe, setTimeframe] = useState<TimeframeKey>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("portfolio-csv");
    if (saved) {
      setRaw(processText(saved));
    }
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light") {
      setDark(false);
      document.documentElement.setAttribute("data-theme", "light");
    }
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.setAttribute("data-theme", "light");
      localStorage.setItem("theme", "light");
    }
  };

  function processText(text: string): RawData {
    if (isHoldingsCSV(text)) {
      return { type: "holdings", data: parseHoldings(text), text };
    }
    const rows = parseCSV(text);
    return { type: "activities", rows, text };
  }

  const handleFileLoad = (text: string) => {
    setRaw(processText(text));
    setTimeframe("all");
    setCustomStart("");
    setCustomEnd("");
  };

  const handleReset = () => {
    localStorage.removeItem("portfolio-csv");
    setRaw(null);
    setTimeframe("all");
  };

  // For activities: compute date range from data
  const dateRange = useMemo(() => {
    if (!raw || raw.type !== "activities") return { min: "", max: "" };
    const dates = raw.rows
      .map((r) => r.Processed)
      .filter(Boolean)
      .sort();
    return { min: dates[0] || "", max: dates[dates.length - 1] || "" };
  }, [raw]);

  // Filter rows and analyze based on timeframe
  const activitiesData: AnalysisResult | null = useMemo(() => {
    if (!raw || raw.type !== "activities") return null;
    const { start, end } = getDateRange(
      timeframe,
      dateRange.min,
      dateRange.max,
      customStart,
      customEnd
    );
    const filtered = raw.rows.filter((r) => {
      const d = r.Processed;
      if (!d) return true;
      return d >= start && d <= end;
    });
    return analyze(filtered);
  }, [raw, timeframe, dateRange, customStart, customEnd]);

  return (
    <main className="min-h-screen p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold">Portfolio Analyzer</h1>
        <div className="flex items-center gap-3">
          {raw && (
            <>
              <span className="text-xs px-2 py-1 rounded bg-[var(--border)] text-[var(--muted)]">
                {raw.type === "holdings"
                  ? "Holdings Snapshot"
                  : "Activity History"}
              </span>
              <button
                onClick={handleReset}
                className="text-sm text-[var(--muted)] hover:text-[var(--text)] transition-colors"
              >
                Upload new file
              </button>
            </>
          )}
          <button
            onClick={toggleTheme}
            className="w-8 h-8 rounded-full bg-[var(--border)] flex items-center justify-center text-sm hover:opacity-80 transition-opacity"
            title={dark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {dark ? "\u2606" : "\u263E"}
          </button>
        </div>
      </div>
      <p className="text-[var(--muted)] text-sm mb-6">
        Options Wheel Strategy Dashboard
      </p>

      {raw ? (
        raw.type === "activities" && activitiesData ? (
          <>
            <TimeframeFilter
              dateRange={dateRange}
              selected={timeframe}
              customStart={customStart}
              customEnd={customEnd}
              onSelect={setTimeframe}
              onCustomChange={(s, e) => {
                setCustomStart(s);
                setCustomEnd(e);
                setTimeframe("custom");
              }}
            />
            <Dashboard data={activitiesData} />
          </>
        ) : raw.type === "holdings" ? (
          <HoldingsDashboard data={raw.data} />
        ) : null
      ) : (
        <UploadZone onFileLoad={handleFileLoad} />
      )}
    </main>
  );
}
