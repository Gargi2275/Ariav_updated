import React from 'react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { Landmark, Printer, Download, CheckCircle2 } from 'lucide-react';

export const BalanceSheetScreen: React.FC = () => {
  const { financialYear, showFlash, navigateTo } = useErp();

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      {/* Unified Page Header */}
      <PageHeader
        moduleNumber="34"
        section="Statutory Reports"
        title="Balance Sheet & Statement of Affairs"
        subtitle={`Position of Assets and Liabilities for ${financialYear} compared with audited FY 2024-25.`}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)] text-xs font-mono text-[var(--erp-text)] hover:border-[var(--erp-gold)] flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-[var(--erp-gold)]" /> Print Balance Sheet
            </button>
            <button
              onClick={() => showFlash('Balance Sheet exported for auditor review', 'gold')}
              className="px-3.5 py-1.5 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-xs font-mono text-[var(--erp-text)] hover:border-[var(--erp-gold)] flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-[var(--erp-gold)]" /> Export Statement
            </button>
          </div>
        }
      />

      {/* Two-Column Strict Financial Presentation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)]">
        {/* Left: LIABILITIES & CAPITAL */}
        <div className="border-b lg:border-b-0 lg:border-r border-[var(--erp-hairline-strong)] flex flex-col justify-between">
          <div>
            <div className="bg-[var(--erp-surface-2)] border-b border-[var(--erp-hairline-strong)] px-4 py-2.5 flex justify-between font-mono text-xs text-[var(--erp-muted)]">
              <span className="font-serif font-bold text-[var(--erp-text)]">LIABILITIES & PARTNER CAPITAL</span>
              <div className="flex gap-8">
                <span className="w-28 text-right font-semibold text-[var(--erp-text)]">Current FY (₹)</span>
                <span className="w-24 text-right">Previous FY (₹)</span>
              </div>
            </div>

            <div className="divide-y divide-[var(--erp-hairline)] font-sans text-xs">
              {/* Partner Capital Group */}
              <div className="p-3 bg-[var(--erp-surface-2)]/30 font-semibold text-[var(--erp-text)] flex justify-between font-mono text-xs">
                <span>Partner Capital Accounts</span>
                <span className="text-[var(--erp-gold)]">₹5,24,00,000.00</span>
              </div>
              <div className="px-4 py-2 flex justify-between text-xs font-mono">
                <span className="text-[var(--erp-muted)] pl-4">Paresh Patel (60% Share)</span>
                <div className="flex gap-8">
                  <span className="w-28 text-right text-[var(--erp-text)]">3,14,40,000.00</span>
                  <span className="w-24 text-right text-[var(--erp-muted)]">2,80,00,000.00</span>
                </div>
              </div>
              <div className="px-4 py-2 flex justify-between text-xs font-mono">
                <span className="text-[var(--erp-muted)] pl-4">Ramesh Patel (40% Share)</span>
                <div className="flex gap-8">
                  <span className="w-28 text-right text-[var(--erp-text)]">2,09,60,000.00</span>
                  <span className="w-24 text-right text-[var(--erp-muted)]">1,86,50,000.00</span>
                </div>
              </div>

              {/* Current Liabilities */}
              <div className="p-3 bg-[var(--erp-surface-2)]/30 font-semibold text-[var(--erp-text)] flex justify-between font-mono text-xs">
                <span>Current Liabilities & Trade Payables</span>
                <span className="text-[var(--erp-gold)]">₹3,18,00,000.00</span>
              </div>
              <div className="px-4 py-2 flex justify-between text-xs font-mono">
                <span className="text-[var(--erp-muted)] pl-4">Sundry Creditors (Mills & Dyers)</span>
                <div className="flex gap-8">
                  <span className="w-28 text-right text-[var(--erp-text)]">2,18,00,000.00</span>
                  <span className="w-24 text-right text-[var(--erp-muted)]">1,48,00,000.00</span>
                </div>
              </div>
              <div className="px-4 py-2 flex justify-between text-xs font-mono">
                <span className="text-[var(--erp-muted)] pl-4">Statutory Taxes Payable (GST/TDS)</span>
                <div className="flex gap-8">
                  <span className="w-28 text-right text-[var(--erp-text)]">1,00,00,000.00</span>
                  <span className="w-24 text-right text-[var(--erp-muted)]">32,00,000.00</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[var(--erp-surface-2)] border-t border-[var(--erp-hairline-strong)] p-3.5 flex justify-between font-mono text-xs font-bold">
            <span className="text-sm font-serif text-[var(--erp-text)]">TOTAL LIABILITIES:</span>
            <div className="flex gap-8 text-sm">
              <span className="w-28 text-right text-[var(--erp-gold)]">₹8,42,00,000.00</span>
              <span className="w-24 text-right text-[var(--erp-muted)]">₹6,46,50,000.00</span>
            </div>
          </div>
        </div>

        {/* Right: ASSETS */}
        <div className="flex flex-col justify-between">
          <div>
            <div className="bg-[var(--erp-surface-2)] border-b border-[var(--erp-hairline-strong)] px-4 py-2.5 flex justify-between font-mono text-xs text-[var(--erp-muted)]">
              <span className="font-serif font-bold text-[var(--erp-text)]">PROPERTY & ASSETS</span>
              <div className="flex gap-8">
                <span className="w-28 text-right font-semibold text-[var(--erp-text)]">Current FY (₹)</span>
                <span className="w-24 text-right">Previous FY (₹)</span>
              </div>
            </div>

            <div className="divide-y divide-[var(--erp-hairline)] font-sans text-xs">
              {/* Fixed Assets */}
              <div className="p-3 bg-[var(--erp-surface-2)]/30 font-semibold text-[var(--erp-text)] flex justify-between font-mono text-xs">
                <span>Fixed Commercial Assets</span>
                <span className="text-[var(--erp-gold)]">₹2,18,00,000.00</span>
              </div>
              <div className="px-4 py-2 flex justify-between text-xs font-mono">
                <span className="text-[var(--erp-muted)] pl-4">Surat Ring Road Premises</span>
                <div className="flex gap-8">
                  <span className="w-28 text-right text-[var(--erp-text)]">1,85,00,000.00</span>
                  <span className="w-24 text-right text-[var(--erp-muted)]">1,85,00,000.00</span>
                </div>
              </div>
              <div className="px-4 py-2 flex justify-between text-xs font-mono">
                <span className="text-[var(--erp-muted)] pl-4">Godown Fixtures & Equipment</span>
                <div className="flex gap-8">
                  <span className="w-28 text-right text-[var(--erp-text)]">33,00,000.00</span>
                  <span className="w-24 text-right text-[var(--erp-muted)]">28,00,000.00</span>
                </div>
              </div>

              {/* Current Assets */}
              <div className="p-3 bg-[var(--erp-surface-2)]/30 font-semibold text-[var(--erp-text)] flex justify-between font-mono text-xs">
                <span>Current Assets & Receivables</span>
                <span className="text-[var(--erp-gold)]">₹6,24,00,000.00</span>
              </div>
              <div className="px-4 py-2 flex justify-between text-xs font-mono">
                <span className="text-[var(--erp-muted)] pl-4">Sundry Debtors (Receivable)</span>
                <div className="flex gap-8">
                  <span className="w-28 text-right text-[var(--erp-text)]">3,94,00,000.00</span>
                  <span className="w-24 text-right text-[var(--erp-muted)]">2,84,00,000.00</span>
                </div>
              </div>
              <div className="px-4 py-2 flex justify-between text-xs font-mono">
                <span className="text-[var(--erp-muted)] pl-4">Closing Fabric Stock in Godowns</span>
                <div className="flex gap-8">
                  <span className="w-28 text-right text-[var(--erp-text)]">68,00,000.00</span>
                  <span className="w-24 text-right text-[var(--erp-muted)]">52,00,000.00</span>
                </div>
              </div>
              <div className="px-4 py-2 flex justify-between text-xs font-mono">
                <span className="text-[var(--erp-muted)] pl-4">Bank & Cash Balances</span>
                <div className="flex gap-8">
                  <span className="w-28 text-right text-[var(--erp-text)]">1,26,00,000.00</span>
                  <span className="w-24 text-right text-[var(--erp-muted)]">85,50,000.00</span>
                </div>
              </div>
              <div className="px-4 py-2 flex justify-between text-xs font-mono">
                <span className="text-[var(--erp-muted)] pl-4">GST Input Tax Credit (ITC)</span>
                <div className="flex gap-8">
                  <span className="w-28 text-right text-[var(--erp-text)]">36,00,000.00</span>
                  <span className="w-24 text-right text-[var(--erp-muted)]">12,00,000.00</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[var(--erp-surface-2)] border-t border-[var(--erp-hairline-strong)] p-3.5 flex justify-between font-mono text-xs font-bold">
            <span className="text-sm font-serif text-[var(--erp-text)]">TOTAL ASSETS:</span>
            <div className="flex gap-8 text-sm">
              <span className="w-28 text-right text-[var(--erp-gold)]">₹8,42,00,000.00</span>
              <span className="w-24 text-right text-[var(--erp-muted)]">₹6,46,50,000.00</span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-3 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-xs font-mono text-[var(--erp-positive)] flex items-center justify-between">
        <span className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> Balanced: Liabilities Total ₹8.42 Cr exactly tallies with Assets Total ₹8.42 Cr
        </span>
        <button onClick={() => navigateTo(29)} className="text-[var(--erp-gold)] hover:underline font-sans">
          View P&L Statement →
        </button>
      </div>
    </div>
  );
};
