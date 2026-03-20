"use client";
import { AnalysisResult } from "@/lib/analyze";
import KPIRow from "./KPIRow";
import PremiumChart from "./PremiumChart";
import PremiumTable from "./PremiumTable";
import AssignmentTable from "./AssignmentTable";
import PnLTable from "./PnLTable";
import TransactionList from "./TransactionList";

export default function Dashboard({ data }: { data: AnalysisResult }) {
  return (
    <div>
      <KPIRow data={data} />
      <PremiumChart entries={data.premiumEntries} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
        <PremiumTable entries={data.premiumEntries} />
        <AssignmentTable assignments={data.assignmentDetails} />
      </div>
      <PnLTable
        positions={data.positions}
        premiumByTicker={data.premiumByTicker}
      />
      <TransactionList transactions={data.transactions} />
    </div>
  );
}
