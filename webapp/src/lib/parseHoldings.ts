import { parseAmount } from "./parseCSV";

export interface Holding {
  accountNumber: string;
  assetCategory: string;
  industry: string;
  symbol: string;
  holding: string;
  quantity: number;
  price: number;
  fund: string;
  averageCost: number;
  bookValue: number;
  marketValue: number;
  accruedInterest: number;
  gl: number;
  glPct: number;
  pctOfAssets: number;
}

export interface HoldingsData {
  equities: Holding[];
  options: Holding[];
  cash: Holding[];
  tbills: Holding[];
  totalMarketValue: number;
  totalBookValue: number;
  totalGL: number;
  cashBalance: number;
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

function parsePct(s: string): number {
  if (!s) return 0;
  return parseFloat(s.replace(/%/g, "")) || 0;
}

export function parseHoldings(text: string): HoldingsData {
  const lines = text.trim().split("\n");
  const headers = parseCSVLine(lines[0]).map((h) => h.trim());

  const rows: Holding[] = lines
    .slice(1)
    .filter((l) => l.trim())
    .map((line) => {
      const vals = parseCSVLine(line);
      const get = (name: string) => {
        const idx = headers.indexOf(name);
        return idx >= 0 ? (vals[idx] || "").trim() : "";
      };
      return {
        accountNumber: get("Account Number"),
        assetCategory: get("Asset Category"),
        industry: get("Industry"),
        symbol: get("Symbol"),
        holding: get("Holding"),
        quantity: parseAmount(get("Quantity")),
        price: parseAmount(get("Price")),
        fund: get("Fund"),
        averageCost: parseAmount(get("Average Cost")),
        bookValue: parseAmount(get("Book Value")),
        marketValue: parseAmount(get("Market Value")),
        accruedInterest: parseAmount(get("Accrued Interest")),
        gl: parseAmount(get("G/L")),
        glPct: parsePct(get("G/L (%)")),
        pctOfAssets: parsePct(get("Percentage of Assets")),
      };
    });

  const equities = rows.filter((r) => r.assetCategory === "EQUITIES");
  const options = rows.filter(
    (r) => r.assetCategory === "OPTIONS & WARRANTS"
  );
  const cash = rows.filter(
    (r) =>
      r.assetCategory === "Cash and Cash Equivalents" &&
      r.holding === "Cash"
  );
  const tbills = rows.filter(
    (r) =>
      r.assetCategory === "Cash and Cash Equivalents" &&
      r.holding?.includes("T BILL")
  );

  const allRows = rows;
  const totalMarketValue = allRows.reduce((s, r) => s + r.marketValue, 0);
  const totalBookValue = allRows.reduce((s, r) => s + r.bookValue, 0);
  const totalGL = allRows.reduce((s, r) => s + r.gl, 0);
  const cashBalance = cash.reduce((s, r) => s + r.marketValue, 0);

  return {
    equities,
    options,
    cash,
    tbills,
    totalMarketValue,
    totalBookValue,
    totalGL,
    cashBalance,
  };
}

export function isHoldingsCSV(text: string): boolean {
  const firstLine = text.split("\n")[0] || "";
  return firstLine.includes("Asset Category") && firstLine.includes("Book Value");
}
