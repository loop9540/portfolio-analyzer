"use client";
import { useState, useEffect } from "react";
import { parseCSV } from "@/lib/parseCSV";
import { analyze, AnalysisResult } from "@/lib/analyze";
import { parseHoldings, isHoldingsCSV, HoldingsData } from "@/lib/parseHoldings";
import UploadZone from "@/components/UploadZone";
import Dashboard from "@/components/Dashboard";
import HoldingsDashboard from "@/components/HoldingsDashboard";

type ViewData =
  | { type: "activities"; data: AnalysisResult }
  | { type: "holdings"; data: HoldingsData };

export default function Home() {
  const [view, setView] = useState<ViewData | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("portfolio-csv");
    if (saved) {
      setView(processText(saved));
    }
  }, []);

  function processText(text: string): ViewData {
    if (isHoldingsCSV(text)) {
      return { type: "holdings", data: parseHoldings(text) };
    }
    const rows = parseCSV(text);
    return { type: "activities", data: analyze(rows) };
  }

  const handleFileLoad = (text: string) => {
    setView(processText(text));
  };

  const handleReset = () => {
    localStorage.removeItem("portfolio-csv");
    setView(null);
  };

  return (
    <main className="min-h-screen p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold">Portfolio Analyzer</h1>
        {view && (
          <div className="flex items-center gap-3">
            <span className="text-xs px-2 py-1 rounded bg-[var(--border)] text-[var(--muted)]">
              {view.type === "holdings" ? "Holdings Snapshot" : "Activity History"}
            </span>
            <button
              onClick={handleReset}
              className="text-sm text-[var(--muted)] hover:text-[var(--text)] transition-colors"
            >
              Upload new file
            </button>
          </div>
        )}
      </div>
      <p className="text-[var(--muted)] text-sm mb-6">
        Options Wheel Strategy Dashboard
      </p>

      {view ? (
        view.type === "activities" ? (
          <Dashboard data={view.data} />
        ) : (
          <HoldingsDashboard data={view.data} />
        )
      ) : (
        <UploadZone onFileLoad={handleFileLoad} />
      )}
    </main>
  );
}
