import React, { useState } from 'react';
import { useErp } from '../../context/ErpContext';
import { PartyPicker, DateInput } from '../../components/common/FormControls';
import { BookCopy, Printer, Download, ArrowUpRight, Filter } from 'lucide-react';

interface LedgerRow {
  id: string;
  date: string;
  voucherType: string;
  voucherNo: string;
  narration: string;
  debit: number;
  credit: number;
  runningBalance: number;
  balanceType: 'Dr' | 'Cr';
}

export const PartyLedgerReportScreen: React.FC = () => {
  const { parties, showFlash, navigateTo } = useErp();

  const [selectedPartyId, setSelectedPartyId] = useState('PT-1001'); // Sharda Synthetics
  const [fromDate, setFromDate] = useState('2026-08-01');
  const [toDate, setToDate] = useState('2026-09-08');

  const selectedParty = parties.find(p => p.id === selectedPartyId) || parties[0];

  const openingBalance = 950000; // Dr

  const ledgerRows: LedgerRow[] = [
    {
      id: 'ROW-0',
      date: '2026-08-01',
      voucherType: 'Opening Balance',
      voucherNo: 'OB-2025-0001',
      narration: 'Opening balance brought forward from FY 2024-25',
      debit: 950000,
      credit: 0,
      runningBalance: 950000,
      balanceType: 'Dr'
    },
    {
      id: 'ROW-1',
      date: '2026-08-08',
      voucherType: 'Sales Tax Invoice',
      voucherNo: 'INV-2025-0792',
      narration: 'Grey Poplin 40x40 5,000 mtr @ ₹38.25 + 5% GST',
      debit: 200812.50,
      credit: 0,
      runningBalance: 1150812.50,
      balanceType: 'Dr'
    },
    {
      id: 'ROW-2',
      date: '2026-08-16',
      voucherType: 'Bank Receipt',
      voucherNo: 'BR-2025-0982',
      narration: 'HDFC Chq #491028 drawn on ICICI Ring Road',
      debit: 0,
      credit: 480000,
      runningBalance: 670812.50,
      balanceType: 'Dr'
    },
    {
      id: 'ROW-3',
      date: '2026-08-25',
      voucherType: 'Sales Tax Invoice',
      voucherNo: 'INV-2025-0899',
      narration: 'Cotton Cambric 60x60 12,000 mtr @ ₹48.50 + 5% GST',
      debit: 611100,
      credit: 0,
      runningBalance: 1281912.50,
      balanceType: 'Dr'
    },
    {
      id: 'ROW-4',
      date: '2026-09-02',
      voucherType: 'Credit Note',
      voucherNo: 'CN-2025-0118',
      narration: 'Rate difference credit @ ₹3/mtr on invoice #0899',
      debit: 0,
      credit: 37800,
      runningBalance: 1244112.50,
      balanceType: 'Dr'
    },
    {
      id: 'ROW-5',
      date: '2026-09-08',
      voucherType: 'Sales Tax Invoice',
      voucherNo: 'INV-2025-1092',
      narration: 'Cotton Cambric & Poplin blend dispatch batch #941',
      debit: 366502.50,
      credit: 0,
      runningBalance: 1610615.00,
      balanceType: 'Dr'
    }
  ];

  const totalDebit = ledgerRows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = ledgerRows.reduce((s, r) => s + r.credit, 0);
  const closingBalance = totalDebit - totalCredit;

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--erp-hairline-strong)] pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BookCopy className="w-4 h-4 text-[var(--erp-gold)]" />
            <span className="font-mono text-xs text-[var(--erp-gold)]">SUB-LEDGER AUDIT STATEMENT</span>
          </div>
          <h2 className="font-serif text-2xl font-bold text-[var(--erp-text)]">
            Party Ledger & Statement of Account
          </h2>
          <p className="text-xs text-[var(--erp-muted)]">
            Continuous chronological ledger statement with debits, credits, and live running balance calculation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)] text-xs font-mono text-[var(--erp-text)] hover:border-[var(--erp-gold)] flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5 text-[var(--erp-gold)]" /> Print Ledger
          </button>
          <button
            onClick={() => showFlash(`Signed PDF statement generated for ${selectedParty.name}`, 'gold')}
            className="px-3.5 py-1.5 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-xs font-mono text-[var(--erp-text)] hover:border-[var(--erp-gold)] flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-[var(--erp-gold)]" /> Export Statement
          </button>
        </div>
      </div>

      {/* Filter Parameters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-4">
        <div className="md:col-span-1">
          <PartyPicker
            label="Party / Customer Account"
            selectedPartyId={selectedPartyId}
            onSelect={setSelectedPartyId}
          />
        </div>
        <DateInput
          label="Statement From Date"
          value={fromDate}
          onChange={e => setFromDate(e.target.value)}
        />
        <DateInput
          label="Statement To Date"
          value={toDate}
          onChange={e => setToDate(e.target.value)}
        />
      </div>

      {/* Ledger Header Summary Strip */}
      <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-4 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-xs">
        <div>
          <span className="text-xs text-[var(--erp-muted)] block">ACCOUNT PARTICULARS:</span>
          <span className="font-serif text-base font-bold text-[var(--erp-text)] block font-sans">
            {selectedParty.name}
          </span>
          <span className="text-[11px] text-[var(--erp-muted)]">
            GSTIN: {selectedParty.gstin} • PAN: {selectedParty.pan} • Broker: {selectedParty.broker}
          </span>
        </div>

        <div className="flex items-center gap-8 text-right">
          <div>
            <span className="text-[10px] text-[var(--erp-muted)] block">OPENING BALANCE</span>
            <span className="text-sm font-semibold text-[var(--erp-text)]">
              ₹{openingBalance.toLocaleString('en-IN')} Dr
            </span>
          </div>
          <div>
            <span className="text-[10px] text-[var(--erp-muted)] block">NET CLOSING BALANCE</span>
            <span className="text-lg font-bold text-[var(--erp-gold)]">
              ₹{closingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })} Dr
            </span>
          </div>
        </div>
      </div>

      {/* Sharp-Cornered Ledger Table */}
      <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] overflow-x-auto">
        <table className="w-full text-left border-collapse font-sans text-xs">
          <thead className="bg-[var(--erp-surface-2)] border-b-2 border-[var(--erp-hairline-strong)] font-mono text-[11px] text-[var(--erp-muted)] select-none">
            <tr>
              <th className="px-3 py-2.5 border-r border-[var(--erp-hairline)] w-24 font-semibold uppercase tracking-wider">Date</th>
              <th className="px-3 py-2.5 border-r border-[var(--erp-hairline)] w-36 font-semibold uppercase tracking-wider">Voucher Type</th>
              <th className="px-3 py-2.5 border-r border-[var(--erp-hairline)] w-32 font-semibold uppercase tracking-wider">Voucher #</th>
              <th className="px-3 py-2.5 border-r border-[var(--erp-hairline)] font-semibold uppercase tracking-wider">Ledger Particulars / Narration</th>
              <th className="px-3 py-2.5 border-r border-[var(--erp-hairline)] text-right w-36 font-semibold uppercase tracking-wider text-[var(--erp-positive)]">Debit (Dr ₹)</th>
              <th className="px-3 py-2.5 border-r border-[var(--erp-hairline)] text-right w-36 font-semibold uppercase tracking-wider text-[var(--erp-gold)]">Credit (Cr ₹)</th>
              <th className="px-3 py-2.5 text-right w-40 font-semibold uppercase tracking-wider">Running Balance (₹)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--erp-hairline)] font-mono">
            {ledgerRows.map(row => (
              <tr key={row.id} className="hover:bg-[var(--erp-surface-2)]/50">
                <td className="px-3 py-2 border-r border-[var(--erp-hairline)] text-[var(--erp-muted)]">
                  {row.date}
                </td>
                <td className="px-3 py-2 border-r border-[var(--erp-hairline)] text-[var(--erp-text)] font-sans">
                  {row.voucherType}
                </td>
                <td className="px-3 py-2 border-r border-[var(--erp-hairline)] text-[var(--erp-gold)] font-medium">
                  {row.voucherNo}
                </td>
                <td className="px-3 py-2 border-r border-[var(--erp-hairline)] font-sans text-xs text-[var(--erp-muted)]">
                  {row.narration}
                </td>
                <td className="px-3 py-2 border-r border-[var(--erp-hairline)] text-right text-[var(--erp-text)]">
                  {row.debit > 0 ? row.debit.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'}
                </td>
                <td className="px-3 py-2 border-r border-[var(--erp-hairline)] text-right text-[var(--erp-positive)]">
                  {row.credit > 0 ? row.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'}
                </td>
                <td className="px-3 py-2 text-right font-semibold text-[var(--erp-gold)]">
                  ₹{row.runningBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })} {row.balanceType}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-[var(--erp-surface-2)] border-t border-[var(--erp-hairline-strong)] font-mono text-xs font-semibold">
            <tr>
              <td colSpan={4} className="px-3 py-2.5 border-r border-[var(--erp-hairline)] text-right text-[var(--erp-muted)]">
                PERIOD TRANSACTION TOTALS:
              </td>
              <td className="px-3 py-2.5 border-r border-[var(--erp-hairline)] text-right text-[var(--erp-text)]">
                ₹{totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </td>
              <td className="px-3 py-2.5 border-r border-[var(--erp-hairline)] text-right text-[var(--erp-positive)]">
                ₹{totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </td>
              <td className="px-3 py-2.5 text-right text-[var(--erp-gold)] text-sm">
                ₹{closingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })} Dr
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
