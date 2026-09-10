import React, { useState } from 'react';
import { useErp } from '../../context/ErpContext';
import { Landmark, ArrowLeftRight, CheckCircle2, Plus, Calendar, Download } from 'lucide-react';

interface BookEntry {
  id: string;
  date: string;
  voucherNo: string;
  particulars: string;
  voucherType: 'Contra' | 'Receipt' | 'Payment';
  contraAccount?: string;
  chequeNo?: string;
  debitReceipt: number;
  creditPayment: number;
  runningBalance: number;
  cleared: boolean;
}

export const BankCashBookScreen: React.FC = () => {
  const { showFlash, addAuditLog } = useErp();
  const [selectedBook, setSelectedBook] = useState<'hdfc' | 'sbi' | 'cash'>('hdfc');

  const hdfcEntries: BookEntry[] = [
    {
      id: 'BK-1',
      date: '2026-09-01',
      voucherNo: 'OB-2025-0901',
      particulars: 'Opening Balance b/f',
      voucherType: 'Receipt',
      debitReceipt: 7850000,
      creditPayment: 0,
      runningBalance: 7850000,
      cleared: true
    },
    {
      id: 'BK-2',
      date: '2026-09-02',
      voucherNo: 'BR-2025-0982',
      particulars: 'Sharda Synthetics Pvt Ltd (On-account RTGS)',
      voucherType: 'Receipt',
      chequeNo: 'UTR#HDFCR5202609028',
      debitReceipt: 480000,
      creditPayment: 0,
      runningBalance: 8330000,
      cleared: true
    },
    {
      id: 'BK-3',
      date: '2026-09-03',
      voucherNo: 'PV-2025-0412',
      particulars: 'Arvind Commercial Agency (NEFT Bill #941)',
      voucherType: 'Payment',
      chequeNo: 'NEFT#941820491',
      debitReceipt: 0,
      creditPayment: 320000,
      runningBalance: 8010000,
      cleared: true
    },
    {
      id: 'BK-4',
      date: '2026-09-04',
      voucherNo: 'CTR-2025-0019',
      particulars: 'Contra: Cash Deposited from Ring Road Cash Vault',
      voucherType: 'Contra',
      contraAccount: 'Petty Cash Till',
      debitReceipt: 250000,
      creditPayment: 0,
      runningBalance: 8260000,
      cleared: true
    },
    {
      id: 'BK-5',
      date: '2026-09-07',
      voucherNo: 'CTR-2025-0022',
      particulars: 'Contra: Self Cash Withdrawal for Weaving Wages',
      voucherType: 'Contra',
      contraAccount: 'Petty Cash Till',
      chequeNo: 'Chq #491028',
      debitReceipt: 0,
      creditPayment: 90000,
      runningBalance: 8170000,
      cleared: true
    },
    {
      id: 'BK-6',
      date: '2026-09-08',
      voucherNo: 'BR-2025-1044',
      particulars: 'Patel & Brothers (Clearing Cheque in transit)',
      voucherType: 'Receipt',
      chequeNo: 'Chq #194029',
      debitReceipt: 250000,
      creditPayment: 0,
      runningBalance: 8420000,
      cleared: false
    }
  ];

  const cashEntries: BookEntry[] = [
    {
      id: 'CS-1',
      date: '2026-09-01',
      voucherNo: 'OB-2025-0901',
      particulars: 'Cash Balance in Head Office Till',
      voucherType: 'Receipt',
      debitReceipt: 180000,
      creditPayment: 0,
      runningBalance: 180000,
      cleared: true
    },
    {
      id: 'CS-2',
      date: '2026-09-04',
      voucherNo: 'CTR-2025-0019',
      particulars: 'Contra: Cash Deposited to HDFC Bank #49182',
      voucherType: 'Contra',
      contraAccount: 'HDFC Bank CA',
      debitReceipt: 0,
      creditPayment: 250000,
      runningBalance: -70000,
      cleared: true
    },
    {
      id: 'CS-3',
      date: '2026-09-05',
      voucherNo: 'CR-2025-0311',
      particulars: 'Cash Sales of Grey Cut Pieces (Tax Invoice #0991)',
      voucherType: 'Receipt',
      debitReceipt: 340000,
      creditPayment: 0,
      runningBalance: 270000,
      cleared: true
    },
    {
      id: 'CS-4',
      date: '2026-09-07',
      voucherNo: 'CTR-2025-0022',
      particulars: 'Contra: Self Cash Withdrawn from HDFC Bank',
      voucherType: 'Contra',
      contraAccount: 'HDFC Bank CA',
      debitReceipt: 90000,
      creditPayment: 0,
      runningBalance: 360000,
      cleared: true
    },
    {
      id: 'CS-5',
      date: '2026-09-08',
      voucherNo: 'PV-2025-0489',
      particulars: 'Petty Office Freight & Tea Expenses',
      voucherType: 'Payment',
      debitReceipt: 0,
      creditPayment: 20000,
      runningBalance: 340000,
      cleared: true
    }
  ];

  const currentList = selectedBook === 'cash' ? cashEntries : hdfcEntries;
  const totalDebits = currentList.reduce((s, r) => s + r.debitReceipt, 0);
  const totalCredits = currentList.reduce((s, r) => s + r.creditPayment, 0);
  const closingBalance = currentList[currentList.length - 1]?.runningBalance || 0;

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--erp-hairline-strong)] pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Landmark className="w-4 h-4 text-[var(--erp-gold)]" />
            <span className="font-mono text-xs text-[var(--erp-gold)]">TREASURY & CONTRA JOURNAL</span>
          </div>
          <h2 className="font-serif text-2xl font-bold text-[var(--erp-text)]">
            Bank Book & Cash Book Register
          </h2>
          <p className="text-xs text-[var(--erp-muted)]">
            Daily running balances, inter-account contra transfers, and bank clearance tracking.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => showFlash('Contra Transfer dialogue opened', 'gold')}
            className="px-3.5 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] font-mono text-xs font-semibold hover:bg-[var(--erp-gold-soft)] transition-colors flex items-center gap-1.5"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" /> Post Contra Entry
          </button>
          <button
            onClick={() => showFlash('Day book printed to thermal register', 'gold')}
            className="px-3 py-1.5 border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)] text-xs font-mono text-[var(--erp-text)] flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-[var(--erp-gold)]" /> Export
          </button>
        </div>
      </div>

      {/* Book Selector Tabs */}
      <div className="flex border-b border-[var(--erp-hairline-strong)] gap-1">
        <button
          onClick={() => setSelectedBook('hdfc')}
          className={`px-4 py-2.5 font-mono text-xs border-b-2 transition-all flex items-center gap-2 ${
            selectedBook === 'hdfc'
              ? 'border-[var(--erp-gold)] text-[var(--erp-gold)] font-bold bg-[var(--erp-surface-2)]/60'
              : 'border-transparent text-[var(--erp-muted)] hover:text-[var(--erp-text)]'
          }`}
        >
          <Landmark className="w-3.5 h-3.5" />
          <span>HDFC Bank CA #50200049182</span>
          <span className="text-[10px] px-1.5 py-0.2 bg-[var(--erp-surface)] border border-[var(--erp-hairline)]">
            ₹84.20 L
          </span>
        </button>

        <button
          onClick={() => setSelectedBook('sbi')}
          className={`px-4 py-2.5 font-mono text-xs border-b-2 transition-all flex items-center gap-2 ${
            selectedBook === 'sbi'
              ? 'border-[var(--erp-gold)] text-[var(--erp-gold)] font-bold bg-[var(--erp-surface-2)]/60'
              : 'border-transparent text-[var(--erp-muted)] hover:text-[var(--erp-text)]'
          }`}
        >
          <Landmark className="w-3.5 h-3.5" />
          <span>SBI CA #3819402811</span>
          <span className="text-[10px] px-1.5 py-0.2 bg-[var(--erp-surface)] border border-[var(--erp-hairline)]">
            ₹38.40 L
          </span>
        </button>

        <button
          onClick={() => setSelectedBook('cash')}
          className={`px-4 py-2.5 font-mono text-xs border-b-2 transition-all flex items-center gap-2 ${
            selectedBook === 'cash'
              ? 'border-[var(--erp-gold)] text-[var(--erp-gold)] font-bold bg-[var(--erp-surface-2)]/60'
              : 'border-transparent text-[var(--erp-muted)] hover:text-[var(--erp-text)]'
          }`}
        >
          <Landmark className="w-3.5 h-3.5" />
          <span>Petty Cash Book (Head Office)</span>
          <span className="text-[10px] px-1.5 py-0.2 bg-[var(--erp-surface)] border border-[var(--erp-hairline)]">
            ₹3.40 L
          </span>
        </button>
      </div>

      {/* Book Running Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs">
        <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-3.5">
          <span className="text-[10px] text-[var(--erp-muted)] block">TOTAL RECEIPTS (DEBITS)</span>
          <span className="text-base font-bold text-[var(--erp-positive)]">
            ₹{totalDebits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-3.5">
          <span className="text-[10px] text-[var(--erp-muted)] block">TOTAL DISBURSEMENTS (PAYMENTS)</span>
          <span className="text-base font-bold text-[var(--erp-negative)]">
            ₹{totalCredits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-3.5">
          <span className="text-[10px] text-[var(--erp-muted)] block">NET CLOSING BALANCE AVAILABLE</span>
          <span className="text-base font-bold text-[var(--erp-gold)]">
            ₹{closingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Sharp-Cornered Ledger Book Table */}
      <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] overflow-x-auto">
        <table className="w-full text-left border-collapse font-sans text-xs">
          <thead className="bg-[var(--erp-surface-2)] border-b-2 border-[var(--erp-hairline-strong)] font-mono text-[11px] text-[var(--erp-muted)] select-none">
            <tr>
              <th className="px-3 py-2.5 border-r border-[var(--erp-hairline)] w-24 font-semibold uppercase tracking-wider">Date</th>
              <th className="px-3 py-2.5 border-r border-[var(--erp-hairline)] w-28 font-semibold uppercase tracking-wider">Voucher #</th>
              <th className="px-3 py-2.5 border-r border-[var(--erp-hairline)] font-semibold uppercase tracking-wider">Particulars / Counter-Account</th>
              <th className="px-3 py-2.5 border-r border-[var(--erp-hairline)] w-36 font-semibold uppercase tracking-wider">Inst. / Chq #</th>
              <th className="px-3 py-2.5 border-r border-[var(--erp-hairline)] text-right w-36 font-semibold uppercase tracking-wider text-[var(--erp-positive)]">Receipts (Dr ₹)</th>
              <th className="px-3 py-2.5 border-r border-[var(--erp-hairline)] text-right w-36 font-semibold uppercase tracking-wider text-[var(--erp-negative)]">Payments (Cr ₹)</th>
              <th className="px-3 py-2.5 border-r border-[var(--erp-hairline)] text-right w-40 font-semibold uppercase tracking-wider text-[var(--erp-gold)]">Running Balance (₹)</th>
              <th className="px-3 py-2.5 text-center w-24 font-semibold uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--erp-hairline)] font-mono">
            {currentList.map(row => (
              <tr
                key={row.id}
                className={`hover:bg-[var(--erp-surface-2)]/50 ${row.voucherType === 'Contra' ? 'bg-[var(--erp-gold)]/5' : ''}`}
              >
                <td className="px-3 py-2 border-r border-[var(--erp-hairline)] text-[var(--erp-muted)]">
                  {row.date}
                </td>
                <td className="px-3 py-2 border-r border-[var(--erp-hairline)] text-[var(--erp-gold)] font-medium">
                  {row.voucherNo}
                </td>
                <td className="px-3 py-2 border-r border-[var(--erp-hairline)] font-sans text-xs text-[var(--erp-text)]">
                  <div className="flex items-center gap-2">
                    {row.voucherType === 'Contra' && (
                      <span className="px-1.5 py-0.2 text-[9px] font-mono bg-[var(--erp-gold)] text-[#0F141B] font-bold">
                        CONTRA
                      </span>
                    )}
                    <span>{row.particulars}</span>
                  </div>
                </td>
                <td className="px-3 py-2 border-r border-[var(--erp-hairline)] text-[var(--erp-muted)]">
                  {row.chequeNo || '—'}
                </td>
                <td className="px-3 py-2 border-r border-[var(--erp-hairline)] text-right text-[var(--erp-positive)]">
                  {row.debitReceipt > 0 ? row.debitReceipt.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'}
                </td>
                <td className="px-3 py-2 border-r border-[var(--erp-hairline)] text-right text-[var(--erp-text)]">
                  {row.creditPayment > 0 ? row.creditPayment.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'}
                </td>
                <td className="px-3 py-2 border-r border-[var(--erp-hairline)] text-right font-semibold text-[var(--erp-gold)]">
                  ₹{row.runningBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-3 py-2 text-center">
                  {row.cleared ? (
                    <span className="text-[10px] text-[var(--erp-positive)] font-mono">Cleared</span>
                  ) : (
                    <span className="text-[10px] text-[var(--erp-gold)] font-mono">Transit</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
