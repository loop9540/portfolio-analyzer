"use client";
import { useCallback, useRef } from "react";

interface Props {
  onFileLoad: (text: string, slot: "activities" | "holdings") => void;
  activitiesLoaded: boolean;
  holdingsLoaded: boolean;
}

function DropSlot({
  label,
  description,
  loaded,
  onFile,
}: {
  label: string;
  description: string;
  loaded: boolean;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
        loaded
          ? "border-[var(--green)] bg-[var(--green)]/5"
          : "border-[var(--border)] hover:border-[var(--accent)]"
      }`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        e.currentTarget.style.borderColor = "var(--accent)";
      }}
      onDragLeave={(e) => {
        e.currentTarget.style.borderColor = "";
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.currentTarget.style.borderColor = "";
        if (e.dataTransfer.files.length) onFile(e.dataTransfer.files[0]);
      }}
    >
      <div className="text-2xl mb-2">{loaded ? "\u2713" : "\u2191"}</div>
      <p className="text-sm font-medium mb-1">{label}</p>
      <p className="text-[var(--muted)] text-xs">
        {loaded ? "Loaded — click to replace" : description}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFile(e.target.files[0]);
        }}
      />
    </div>
  );
}

export default function UploadZone({
  onFileLoad,
  activitiesLoaded,
  holdingsLoaded,
}: Props) {
  const readFile = useCallback(
    (file: File, slot: "activities" | "holdings") => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        if (text) onFileLoad(text, slot);
      };
      reader.readAsText(file);
    },
    [onFileLoad]
  );

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <DropSlot
          label="Activities CSV"
          description="Transaction history (AccountActivities...csv)"
          loaded={activitiesLoaded}
          onFile={(f) => readFile(f, "activities")}
        />
        <DropSlot
          label="Holdings CSV"
          description="Current positions (AccountsHoldings...csv)"
          loaded={holdingsLoaded}
          onFile={(f) => readFile(f, "holdings")}
        />
      </div>
      <p className="text-center text-[var(--muted)] text-xs">
        Upload both files for the full combined analysis, or just one for a
        single view.
      </p>
    </div>
  );
}
