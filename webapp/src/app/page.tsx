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
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("portfolio-csv");
    if (saved) {
      setView(processText(saved));
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
        <div className="flex items-center gap-3">
          {view && (
            <>
              <span className="text-xs px-2 py-1 rounded bg-[var(--border)] text-[var(--muted)]">
                {view.type === "holdings" ? "Holdings Snapshot" : "Activity History"}
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
