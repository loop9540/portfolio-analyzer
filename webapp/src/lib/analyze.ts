import { Transaction, parseAmount, parseTicker } from "./parseCSV";

export interface PremiumEntry {
  ticker: string;
  sold: number;
  bought: number;
  net: number;
}

export interface AssignmentDetail {
  ticker: string;
  shares: number;
  strike: number;
  cost: number;
  date: string;
  type: string;
}

export interface Position {
  shares: number;
  totalCost: number;
}

export interface CategorizedTransaction extends Transaction {
  _category: string;
  _amount: number;
}

export interface AnalysisResult {
  premiumEntries: PremiumEntry[];
  totalSold: number;
  totalBought: number;
  totalNet: number;
  totalMgmtFees: number;
  totalGST: number;
  totalDividends: number;
  totalWithholding: number;
  totalInterest: number;
  assignmentDetails: AssignmentDetail[];
  positions: Record<string, Position>;
  premiumByTicker: Record<string, { sold: number; bought: number }>;
  transactions: CategorizedTransaction[];
}

export function analyze(rows: Transaction[]): AnalysisResult {
  // Filter out cancels
  const cancelIndices = new Set<number>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r["Tran Types"] && r["Tran Types"].startsWith("CANCEL")) {
      cancelIndices.add(i);
      const origType = r["Tran Types"].replace("CANCEL ", "");
      for (let j = i + 1; j < rows.length; j++) {
        if (
          !cancelIndices.has(j) &&
          rows[j]["Tran Types"] === origType &&
          rows[j].Description === r.Description &&
          Math.abs(parseAmount(rows[j].Amount) + parseAmount(r.Amount)) < 0.01
        ) {
          cancelIndices.add(j);
          break;
        }
      }
    }
  }

  const txns = rows.filter((_, i) => !cancelIndices.has(i));

  const optionTrades: Transaction[] = [];
  const stockTrades: Transaction[] = [];
  const fees: Transaction[] = [];
  const dividends: Transaction[] = [];
  const interest: Transaction[] = [];
  const assignments: Transaction[] = [];

  txns.forEach((r) => {
    const type = r["Tran Types"] || "";
    const desc = r.Description || "";

    if (type === "ASSIGNMENT") {
      assignments.push(r);
    } else if (type === "MANAGEMENT FEE" || type === "GOODS & SERVICES TAX") {
      fees.push(r);
    } else if (
      type === "US CASH DIVIDEND" ||
      type === "IRS WHT(TREATY) - POOL 2"
    ) {
      dividends.push(r);
    } else if (type === "MONTHLY INTEREST") {
      interest.push(r);
    } else if (desc.match(/^(PUT|CALL)\s+100/)) {
      optionTrades.push(r);
    } else if (
      r.Symbol &&
      (type === "BUY" || type === "SELL") &&
      !desc.match(/^(PUT|CALL)/)
    ) {
      stockTrades.push(r);
    }
  });

  // Premium by ticker
  const premiumByTicker: Record<string, { sold: number; bought: number }> = {};
  optionTrades.forEach((r) => {
    const ticker = parseTicker(r.Description);
    if (!ticker) return;
    if (!premiumByTicker[ticker])
      premiumByTicker[ticker] = { sold: 0, bought: 0 };
    const amt = parseAmount(r.Amount);
    const type = r["Tran Types"];
    if (type === "SELL") premiumByTicker[ticker].sold += amt;
    else if (type === "BUY")
      premiumByTicker[ticker].bought += Math.abs(amt);
  });

  const premiumEntries = Object.entries(premiumByTicker)
    .map(([ticker, v]) => ({
      ticker,
      sold: v.sold,
      bought: v.bought,
      net: v.sold - v.bought,
    }))
    .sort((a, b) => b.net - a.net);

  const totalSold = premiumEntries.reduce((s, e) => s + e.sold, 0);
  const totalBought = premiumEntries.reduce((s, e) => s + e.bought, 0);
  const totalNet = totalSold - totalBought;

  const totalMgmtFees = fees
    .filter((r) => r["Tran Types"] === "MANAGEMENT FEE")
    .reduce((s, r) => s + Math.abs(parseAmount(r.Amount)), 0);
  const totalGST = fees
    .filter((r) => r["Tran Types"] === "GOODS & SERVICES TAX")
    .reduce((s, r) => s + Math.abs(parseAmount(r.Amount)), 0);

  const totalDividends = dividends
    .filter((r) => r["Tran Types"] === "US CASH DIVIDEND")
    .reduce((s, r) => s + parseAmount(r.Amount), 0);
  const totalWithholding = dividends
    .filter((r) => r["Tran Types"] === "IRS WHT(TREATY) - POOL 2")
    .reduce((s, r) => s + Math.abs(parseAmount(r.Amount)), 0);

  const totalInterest = interest.reduce(
    (s, r) => s + parseAmount(r.Amount),
    0
  );

  // Assignments
  const assignmentDetails: AssignmentDetail[] = [];
  assignments.forEach((r) => {
    const desc = r.Description || "";
    const m = desc.match(/(PUT|CALL)\s+100\s+(\w+)\s+(\S+)\s+(\S+)/);
    if (!m) return;
    const ticker = m[2];
    const qty = Math.abs(parseFloat(r.Quantity) || 0) * 100;
    const strike = parseFloat(m[4]) || 0;
    assignmentDetails.push({
      ticker,
      shares: qty,
      strike,
      cost: qty * strike,
      date: r.Processed,
      type: m[1],
    });
  });

  // Positions
  const positions: Record<string, Position> = {};
  assignmentDetails.forEach((a) => {
    if (!positions[a.ticker]) positions[a.ticker] = { shares: 0, totalCost: 0 };
    positions[a.ticker].shares += a.shares;
    positions[a.ticker].totalCost += a.cost;
  });

  stockTrades.forEach((r) => {
    const ticker = r.Symbol;
    const qty = Math.abs(parseFloat(r.Quantity) || 0);
    const amt = Math.abs(parseAmount(r.Amount));
    const type = r["Tran Types"];
    if (type === "BUY" && !positions[ticker]) {
      positions[ticker] = { shares: 0, totalCost: 0 };
      positions[ticker].shares += qty;
      positions[ticker].totalCost += amt;
    }
  });

  // Categorized transactions
  const transactions: CategorizedTransaction[] = txns.map((r) => {
    const type = r["Tran Types"] || "";
    const desc = r.Description || "";
    let category = "other";
    if (
      desc.match(/^(PUT|CALL)\s+100/) ||
      type === "ASSIGNMENT" ||
      type === "EXPIRING RIGHTS/WARRANTS"
    )
      category = "options";
    else if (
      r.Symbol &&
      (type === "BUY" || type === "SELL") &&
      !desc.includes("T BILL")
    )
      category = "stocks";
    else if (type === "MANAGEMENT FEE" || type === "GOODS & SERVICES TAX")
      category = "fees";
    else if (desc.includes("US T BILL")) category = "tbills";
    return { ...r, _category: category, _amount: parseAmount(r.Amount) };
  });

  return {
    premiumEntries,
    totalSold,
    totalBought,
    totalNet,
    totalMgmtFees,
    totalGST,
    totalDividends,
    totalWithholding,
    totalInterest,
    assignmentDetails,
    positions,
    premiumByTicker,
    transactions,
  };
}
