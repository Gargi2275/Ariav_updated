import React from 'react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { TrendingUp, Printer, Download, CheckCircle2 } from 'lucide-react';

export const ProfitAndLossScreen: React.FC = () => {
  const { financialYear, showFlash, navigateTo } = useErp();

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      {/* Unified Page Header */}
      <PageHeader
        moduleNumber="33"
        section="Statutory Reports"
        title="Profit & Loss Statement (Trading & P&L)"
        subtitle={`Audited financial performance for FY ${financialYear} covering fabric trading, commission accruals, and operating costs.`}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)] text-xs font-mono text-[var(--erp-text)] hover:border-[var(--erp-gold)] flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-[var(--erp-gold)]" /> Print P&L
            </button>
            <button
              onClick={() => showFlash('P&L schedule exported to CA review bundle', 'gold')}
              className="px-3.5 py-1.5 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-xs font-mono text-[var(--erp-text)] hover:border-[var(--erp-gold)] flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-[var(--erp-gold)]" /> Export
            </button>
          </div>
        }
      />

      {/* Structured Multi-Section P&L Table */}
      <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] overflow-hidden">
        {/* SECTION 1: TRADING ACCOUNT */}
        <div className="bg-[var(--erp-surface-2)] border-b border-[var(--erp-hairline-strong)] px-4 py-2.5 flex justify-between font-mono text-xs font-semibold text-[var(--erp-text)]">
          <span>PART I: TRADING ACCOUNT (GROSS PROFIT)</span>
          <span className="w-40 text-right">AMOUNT (₹)</span>
        </div>

        <div className="divide-y divide-[var(--erp-hairline)] font-mono text-xs">
          <div className="px-4 py-2.5 flex justify-between">
            <span className="text-[var(--erp-text)] font-sans">Gross Fabric Sales Turnover</span>
            <span className="w-40 text-right text-[var(--erp-text)]">11,85,60,000.00</span>
          </div>
          <div className="px-4 py-2.5 flex justify-between text-[var(--erp-muted)]">
            <span className="pl-4 font-sans">Less: Material Returns & Quality Rebates</span>
            <span className="w-40 text-right text-[var(--erp-negative)]">- 12,40,000.00</span>
          </div>
          <div className="px-4 py-2.5 flex justify-between font-semibold bg-[var(--erp-surface-2)]/30">
            <span className="font-sans text-[var(--erp-text)]">Net Sales Revenue</span>
            <span className="w-40 text-right text-[var(--erp-text)]">11,73,20,000.00</span>
          </div>
          <div className="px-4 py-2.5 flex justify-between">
            <span className="text-[var(--erp-text)] font-sans">Add: Closing Stock of Fabric (at cost or NRV)</span>
            <span className="w-40 text-right text-[var(--erp-text)]">68,00,000.00</span>
          </div>
          <div className="px-4 py-2.5 flex justify-between text-[var(--erp-muted)]">
            <span className="font-sans">Less: Opening Stock brought forward</span>
            <span className="w-40 text-right">- 52,00,000.00</span>
          </div>
          <div className="px-4 py-2.5 flex justify-between text-[var(--erp-muted)]">
            <span className="font-sans">Less: Weaving Mill Purchases & Grey Inward</span>
            <span className="w-40 text-right">- 8,42,00,000.00</span>
          </div>
          <div className="px-4 py-2.5 flex justify-between text-[var(--erp-muted)]">
            <span className="font-sans">Less: Direct Inward Freight & Cartage</span>
            <span className="w-40 text-right">- 25,80,000.00</span>
          </div>

          <div className="px-4 py-3 flex justify-between font-bold bg-[var(--erp-surface-2)] border-t border-[var(--erp-hairline-strong)] text-sm">
            <span className="font-serif text-[var(--erp-text)]">GROSS TRADING PROFIT (c/f to P&L):</span>
            <span className="w-40 text-right text-[var(--erp-gold)]">₹3,21,40,000.00</span>
          </div>
        </div>

        {/* SECTION 2: PROFIT & LOSS ACCOUNT */}
        <div className="bg-[var(--erp-surface-2)] border-y border-[var(--erp-hairline-strong)] px-4 py-2.5 flex justify-between font-mono text-xs font-semibold text-[var(--erp-text)]">
          <span>PART II: OPERATING & ADMINISTRATIVE OVERHEADS</span>
          <span className="w-40 text-right">AMOUNT (₹)</span>
        </div>

        <div className="divide-y divide-[var(--erp-hairline)] font-mono text-xs">
          <div className="px-4 py-2.5 flex justify-between">
            <span className="text-[var(--erp-text)] font-sans">Gross Trading Profit brought down</span>
            <span className="w-40 text-right text-[var(--erp-text)]">3,21,40,000.00</span>
          </div>
          <div className="px-4 py-2.5 flex justify-between text-[var(--erp-positive)]">
            <span className="font-sans">Add: Commercial Agency Commission Inflows</span>
            <span className="w-40 text-right">+ 29,64,000.00</span>
          </div>
          <div className="px-4 py-2.5 flex justify-between text-[var(--erp-muted)]">
            <span className="pl-4 font-sans">Less: Brokerage Disbursed to Commission Agents</span>
            <span className="w-40 text-right text-[var(--erp-negative)]">- 1,48,00,000.00</span>
          </div>
          <div className="px-4 py-2.5 flex justify-between text-[var(--erp-muted)]">
            <span className="pl-4 font-sans">Less: Warehouse & Depot Mending Wages</span>
            <span className="w-40 text-right text-[var(--erp-negative)]">- 38,20,000.00</span>
          </div>
          <div className="px-4 py-2.5 flex justify-between text-[var(--erp-muted)]">
            <span className="pl-4 font-sans">Less: Commercial Godown & Office Lease Rentals</span>
            <span className="w-40 text-right text-[var(--erp-negative)]">- 48,00,000.00</span>
          </div>
          <div className="px-4 py-2.5 flex justify-between text-[var(--erp-muted)]">
            <span className="pl-4 font-sans">Less: Depreciation on Warehouse Fixtures</span>
            <span className="w-40 text-right text-[var(--erp-negative)]">- 5,00,000.00</span>
          </div>
          <div className="px-4 py-2.5 flex justify-between text-[var(--erp-muted)]">
            <span className="pl-4 font-sans">Less: Bank Charges, Software & Administrative Costs</span>
            <span className="w-40 text-right text-[var(--erp-negative)]">- 69,04,000.00</span>
          </div>

          <div className="px-4 py-3 flex justify-between font-bold bg-[var(--erp-surface-2)] border-t border-[var(--erp-hairline-strong)] text-base">
            <span className="font-serif text-[var(--erp-text)]">NET OPERATING PROFIT BEFORE TAX:</span>
            <span className="w-40 text-right text-[var(--erp-positive)]">₹42,80,000.00</span>
          </div>
        </div>

        {/* SECTION 3: PARTNER APPROPRIATION */}
        <div className="bg-[var(--erp-surface-2)] border-y border-[var(--erp-hairline-strong)] px-4 py-2.5 flex justify-between font-mono text-xs font-semibold text-[var(--erp-text)]">
          <span>PART III: PARTNERSHIP APPROPRIATION STATEMENT</span>
          <span className="w-40 text-right">ALLOCATED (₹)</span>
        </div>

        <div className="divide-y divide-[var(--erp-hairline)] font-mono text-xs">
          <div className="px-4 py-2 flex justify-between text-[var(--erp-muted)]">
            <span className="pl-4 font-sans">Paresh Patel (Senior Partner 60%)</span>
            <span className="w-40 text-right text-[var(--erp-text)]">₹25,68,000.00 Cr</span>
          </div>
          <div className="px-4 py-2 flex justify-between text-[var(--erp-muted)]">
            <span className="pl-4 font-sans">Ramesh Patel (Partner 40%)</span>
            <span className="w-40 text-right text-[var(--erp-text)]">₹17,12,000.00 Cr</span>
          </div>
        </div>
      </div>

      <div className="p-3 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-xs font-mono text-[var(--erp-positive)] flex items-center justify-between">
        <span className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> Net Margin: 3.6% • Gross Margin: 27.4% • In Line with Gujarat Textile Averages
        </span>
        <button onClick={() => navigateTo(28)} className="text-[var(--erp-gold)] hover:underline font-sans">
          View Balance Sheet →
        </button>
      </div>
    </div>
  );
};
