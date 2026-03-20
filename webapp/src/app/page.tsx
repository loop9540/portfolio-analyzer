"use client";
import { useState, useEffect } from "react";
import { parseCSV } from "@/lib/parseCSV";
import { analyze, AnalysisResult } from "@/lib/analyze";
import UploadZone from "@/components/UploadZone";
import Dashboard from "@/components/Dashboard";

export default function Home() {
  const [data, setData] = useState<AnalysisResult | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("portfolio-csv");
    if (saved) {
      const rows = parseCSV(saved);
      setData(analyze(rows));
    }
  }, []);

  const handleFileLoad = (text: string) => {
    const rows = parseCSV(text);
    setData(analyze(rows));
  };

  const handleReset = () => {
    localStorage.removeItem("portfolio-csv");
    setData(null);
  };

  return (
    <main className="min-h-screen p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold">Portfolio Analyzer</h1>
        {data && (
          <button
            onClick={handleReset}
            className="text-sm text-[var(--muted)] hover:text-[var(--text)] transition-colors"
          >
            Upload new file
          </button>
        )}
      </div>
      <p className="text-[var(--muted)] text-sm mb-6">
        Options Wheel Strategy Dashboard
      </p>

      {data ? (
        <Dashboard data={data} />
      ) : (
        <UploadZone onFileLoad={handleFileLoad} />
      )}
    </main>
  );
}
