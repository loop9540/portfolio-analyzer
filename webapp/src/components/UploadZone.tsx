"use client";
import { useCallback, useRef } from "react";

interface Props {
  onFileLoad: (text: string) => void;
}

export default function UploadZone({ onFileLoad }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        if (text) {
          localStorage.setItem("portfolio-csv", text);
          onFileLoad(text);
        }
      };
      reader.readAsText(file);
    },
    [onFileLoad]
  );

  return (
    <div
      className="border-2 border-dashed border-[var(--border)] rounded-xl p-12 text-center cursor-pointer hover:border-[var(--accent)] transition-colors"
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
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
      }}
    >
      <div className="text-4xl mb-2">📂</div>
      <p className="text-[var(--muted)] text-sm">
        Drop your AccountActivities CSV here, or click to browse
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) handleFile(e.target.files[0]);
        }}
      />
    </div>
  );
}
