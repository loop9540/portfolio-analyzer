export interface Transaction {
  Processed: string;
  Settled: string;
  "Tran Types": string;
  Symbol: string;
  Description: string;
  Price: string;
  Quantity: string;
  Amount: string;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      inQuotes = !inQuotes;
    } else if (line[i] === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += line[i];
    }
  }
  result.push(current);
  return result;
}

export function parseCSV(text: string): Transaction[] {
  const lines = text.trim().split("\n");
  const headers = parseCSVLine(lines[0]);
  return lines
    .slice(1)
    .filter((l) => l.trim())
    .map((line) => {
      const vals = parseCSVLine(line);
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => (obj[h.trim()] = (vals[i] || "").trim()));
      return obj as unknown as Transaction;
    });
}

export function parseAmount(s: string): number {
  if (!s) return 0;
  return parseFloat(s.replace(/[$,]/g, "")) || 0;
}

export function parseTicker(desc: string): string | null {
  if (!desc) return null;
  const m = desc.match(/(?:PUT|CALL)\s+100\s+(\w+)/);
  return m ? m[1] : null;
}

export function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  const formatted =
    abs >= 1000
      ? abs.toLocaleString("en-US", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        })
      : abs.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
  return (n < 0 ? "-" : "") + "$" + formatted;
}
