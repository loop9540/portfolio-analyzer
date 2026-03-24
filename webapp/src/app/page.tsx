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
import CombinedDashboard from "@/components/CombinedDashboard";
import TimeframeFilter, {
  TimeframeKey,
  getDateRange,
} from "@/components/TimeframeFilter";

export default function Home() {
  const [activitiesText, setActivitiesText] = useState<string | null>(null);
  const [holdingsText, setHoldingsText] = useState<string | null>(null);
  const [dark, setDark] = useState(true);
  const [timeframe, setTimeframe] = useState<TimeframeKey>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  useEffect(() => {
    // Load from localStorage, with migration from old key
    const oldCsv = localStorage.getItem("portfolio-csv");
    const savedAct = localStorage.getItem("portfolio-csv-activities");
    const savedHold = localStorage.getItem("portfolio-csv-holdings");

    if (savedAct) setActivitiesText(savedAct);
    if (savedHold) setHoldingsText(savedHold);

    // Migrate old single key
    if (oldCsv && !savedAct && !savedHold) {
      if (isHoldingsCSV(oldCsv)) {
        localStorage.setItem("portfolio-csv-holdings", oldCsv);
        setHoldingsText(oldCsv);
      } else {
        localStorage.setItem("portfolio-csv-activities", oldCsv);
        setActivitiesText(oldCsv);
      }
      localStorage.removeItem("portfolio-csv");
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

  const handleFileLoad = (text: string, slot: "activities" | "holdings") => {
    // Auto-detect and route to correct slot
    const isHoldings = isHoldingsCSV(text);
    const actualSlot = isHoldings ? "holdings" : "activities";

    if (actualSlot === "activities") {
      localStorage.setItem("portfolio-csv-activities", text);
      setActivitiesText(text);
    } else {
      localStorage.setItem("portfolio-csv-holdings", text);
      setHoldingsText(text);
    }
  };

  const handleReset = () => {
    localStorage.removeItem("portfolio-csv-activities");
    localStorage.removeItem("portfolio-csv-holdings");
    localStorage.removeItem("portfolio-csv");
    setActivitiesText(null);
    setHoldingsText(null);
    setTimeframe("all");
  };

  // Parse raw data
  const activitiesRows: Transaction[] | null = useMemo(
    () => (activitiesText ? parseCSV(activitiesText) : null),
    [activitiesText]
  );

  const holdingsData: HoldingsData | null = useMemo(
    () => (holdingsText ? parseHoldings(holdingsText) : null),
    [holdingsText]
  );

  // Date range for activities
  const dateRange = useMemo(() => {
    if (!activitiesRows) return { min: "", max: "" };
    const dates = activitiesRows
      .map((r) => r.Processed)
      .filter(Boolean)
      .sort();
    return { min: dates[0] || "", max: dates[dates.length - 1] || "" };
  }, [activitiesRows]);

  // Filtered activities analysis
  const activitiesData: AnalysisResult | null = useMemo(() => {
    if (!activitiesRows) return null;
    const { start, end } = getDateRange(
      timeframe,
      dateRange.min,
      dateRange.max,
      customStart,
      customEnd
    );
    const filtered = activitiesRows.filter((r) => {
      const d = r.Processed;
      if (!d) return true;
      return d >= start && d <= end;
    });
    return analyze(filtered);
  }, [activitiesRows, timeframe, dateRange, customStart, customEnd]);

  // View mode
  const viewMode =
    activitiesData && holdingsData
      ? "combined"
      : activitiesData
      ? "activities"
      : holdingsData
      ? "holdings"
      : "upload";

  const hasAnyData = activitiesText || holdingsText;

  return (
    <main className="min-h-screen p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold">Portfolio Analyzer</h1>
        <div className="flex items-center gap-3">
          {hasAnyData && (
            <>
              <span className="text-xs px-2 py-1 rounded bg-[var(--border)] text-[var(--muted)]">
                {viewMode === "combined"
                  ? "Activities + Holdings"
                  : viewMode === "activities"
                  ? "Activity History"
                  : "Holdings Snapshot"}
              </span>
              <button
                onClick={handleReset}
                className="text-sm text-[var(--muted)] hover:text-[var(--text)] transition-colors"
              >
                Reset
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

      {viewMode === "upload" && (
        <UploadZone
          onFileLoad={handleFileLoad}
          activitiesLoaded={false}
          holdingsLoaded={false}
        />
      )}

      {viewMode !== "upload" && !activitiesText && !holdingsText ? null : null}

      {/* Show upload zone for missing file when only one is loaded */}
      {hasAnyData && viewMode !== "combined" && (
        <div className="mb-6">
          <UploadZone
            onFileLoad={handleFileLoad}
            activitiesLoaded={!!activitiesText}
            holdingsLoaded={!!holdingsText}
          />
        </div>
      )}

      {/* Timeframe filter for activities */}
      {activitiesData && (
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
      )}

      {/* Dashboards */}
      {viewMode === "combined" && activitiesData && holdingsData && (
        <CombinedDashboard activities={activitiesData} holdings={holdingsData} />
      )}
      {viewMode === "activities" && activitiesData && (
        <Dashboard data={activitiesData} />
      )}
      {viewMode === "holdings" && holdingsData && (
        <HoldingsDashboard data={holdingsData} />
      )}
    </main>
  );
}
