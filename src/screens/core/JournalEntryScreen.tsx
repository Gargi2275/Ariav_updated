import React, { useState } from 'react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { TextInput, DateInput } from '../../components/common/FormControls';
import { BookOpen, Plus, Trash2, CheckCircle2, AlertTriangle, Save } from 'lucide-react';

interface JournalLine {
  id: string;
  account: string;
  debit: number;
  credit: number;
  narration: string;
}

export const JournalEntryScreen: React.FC = () => {
  const { showFlash, addAuditLog, navigateTo } = useErp();

  const [voucherNo, setVoucherNo] = useState('JV-2025-0291');
  const [voucherDate, setVoucherDate] = useState('2026-09-08');
  const [generalNarration, setGeneralNarration] = useState('Quarterly textile broker commission provision and GST reversal adjustment');

  const [lines, setLines] = useState<JournalLine[]>([
    {
      id: 'JL-1',
      account: 'Brokerage & Commission Expense A/c',
      debit: 148200,
      credit: 0,
      narration: 'Provision for 2% commission to Jigneshbhai Vora on August dispatches'
    },
    {
      id: 'JL-2',
      account: 'TDS on Brokerage Payable A/c (Sec 194H)',
      debit: 0,
      credit: 7410,
      narration: '5% TDS withheld'
    },
    {
      id: 'JL-3',
      account: 'Jigneshbhai Vora (Broker Personal A/c)',
      debit: 0,
      credit: 140790,
      narration: 'Net brokerage payable for Q2'
    }
  ]);

  const updateLine = (id: string, field: keyof JournalLine, value: any) => {
    setLines(prev =>
      prev.map(l => {
        if (l.id === id) {
          const updated = { ...l, [field]: value };
          if (field === 'debit' && parseFloat(value) > 0) {
            updated.credit = 0;
            updated.debit = parseFloat(value) || 0;
          } else if (field === 'credit' && parseFloat(value) > 0) {
            updated.debit = 0;
            updated.credit = parseFloat(value) || 0;
          }
          return updated;
        }
        return l;
      })
    );
  };

  const addLine = () => {
    const newLine: JournalLine = {
      id: `JL-${Date.now().toString().slice(-4)}`,
      account: 'GST Input Tax Credit (ITC) Reversal A/c',
      debit: 0,
      credit: 0,
      narration: ''
    };
    setLines(prev => [...prev, newLine]);
  };

  const removeLine = (id: string) => {
    if (lines.length <= 2) return;
    setLines(prev => prev.filter(l => l.id !== id));
  };

  const totalDebit = lines.reduce((acc, l) => acc + (parseFloat(l.debit as any) || 0), 0);
  const totalCredit = lines.reduce((acc, l) => acc + (parseFloat(l.credit as any) || 0), 0);
  const difference = Math.abs(totalDebit - totalCredit);
  const isBalanced = difference < 0.01;

  const handlePost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isBalanced) return;

    addAuditLog(
      'Posted Double-Entry Journal Voucher',
      'Journal & Adjustments',
      `Voucher ${voucherNo}: ₹${totalDebit.toLocaleString('en-IN')} balanced entry posted across ${lines.length} ledger heads`,
      'notice'
    );
    showFlash(`Journal Voucher ${voucherNo} posted. General Ledger updated.`, 'positive');
    navigateTo(27); // Go to Trial Balance
  };

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      {/* Unified Page Header */}
      <PageHeader
        moduleNumber="16"
        section="Core Operations"
        title="Journal Entry & Live Balance Check"
        subtitle="Accruals, provisions, year-end adjustments and inter-ledger transfers with strict arithmetic balance verification."
        actions={
          <button
            onClick={handlePost}
            disabled={!isBalanced}
            className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] font-mono text-xs font-semibold hover:bg-[var(--erp-gold-soft)] disabled:opacity-40 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" /> Post Journal Entry
          </button>
        }
      />

      <form onSubmit={handlePost} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-5">
          <TextInput
            label="Journal Voucher #"
            mono
            value={voucherNo}
            onChange={e => setVoucherNo(e.target.value)}
          />
          <DateInput
            label="Voucher Date"
            value={voucherDate}
            onChange={e => setVoucherDate(e.target.value)}
          />
          <TextInput
            label="Overall Journal Narration"
            value={generalNarration}
            onChange={e => setGeneralNarration(e.target.value)}
          />
        </div>

        {/* Live Balance Status Strip */}
        <div
          className={`p-4 border font-mono text-xs flex flex-col sm:flex-row items-center justify-between gap-4 transition-colors ${
            isBalanced
              ? 'bg-[var(--erp-positive)]/10 border-[var(--erp-positive)]/40 text-[var(--erp-positive)]'
              : 'bg-[var(--erp-negative)]/10 border-[var(--erp-negative)]/40 text-[var(--erp-negative)]'
          }`}
        >
          <div className="flex items-center gap-2">
            {isBalanced ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-[var(--erp-positive)]" />
                <div>
                  <strong className="block">DOUBLE-ENTRY BALANCED PERFECTLY</strong>
                  <span className="text-[11px] text-[var(--erp-muted)] font-sans">
                    Debit total matches credit total. Ready to commit to general ledger.
                  </span>
                </div>
              </>
            ) : (
              <>
                <AlertTriangle className="w-5 h-5 text-[var(--erp-negative)]" />
                <div>
                  <strong className="block">ARITHMETIC VARIANCE DETECTED</strong>
                  <span className="text-[11px] text-[var(--erp-muted)] font-sans">
                    Debits and credits do not match. Difference must be exactly zero before posting.
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-6 text-right">
            <div>
              <span className="text-[10px] text-[var(--erp-muted)] block">TOTAL DEBIT</span>
              <span className="text-base font-bold text-[var(--erp-text)]">
                ₹{totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-[var(--erp-muted)] block">TOTAL CREDIT</span>
              <span className="text-base font-bold text-[var(--erp-text)]">
                ₹{totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            {!isBalanced && (
              <div>
                <span className="text-[10px] text-[var(--erp-negative)] block">VARIANCE</span>
                <span className="text-base font-bold text-[var(--erp-negative)]">
                  ₹{difference.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Double-Entry Journal Lines Table */}
        <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] overflow-x-auto">
          <table className="w-full text-left border-collapse font-sans text-xs">
            <thead className="bg-[var(--erp-surface-2)] border-b-2 border-[var(--erp-hairline-strong)] font-mono text-[11px] text-[var(--erp-muted)] select-none">
              <tr>
                <th className="px-3 py-2.5 border-r border-[var(--erp-hairline)] w-10 text-center font-semibold uppercase tracking-wider">#</th>
                <th className="px-3 py-2.5 border-r border-[var(--erp-hairline)] w-1/3 font-semibold uppercase tracking-wider">Ledger Head / Account</th>
                <th className="px-3 py-2.5 border-r border-[var(--erp-hairline)] text-right w-36 font-semibold uppercase tracking-wider text-[var(--erp-positive)]">Debit (Dr ₹)</th>
                <th className="px-3 py-2.5 border-r border-[var(--erp-hairline)] text-right w-36 font-semibold uppercase tracking-wider text-[var(--erp-gold)]">Credit (Cr ₹)</th>
                <th className="px-3 py-2.5 border-r border-[var(--erp-hairline)] font-semibold uppercase tracking-wider">Line Narration</th>
                <th className="px-3 py-2.5 w-12 text-center font-semibold uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--erp-hairline)] font-mono">
              {lines.map((line, idx) => (
                <tr key={line.id} className="hover:bg-[var(--erp-surface-2)]/50">
                  <td className="px-3 py-2 border-r border-[var(--erp-hairline)] text-[var(--erp-muted)]">
                    {idx + 1}
                  </td>
                  <td className="px-3 py-2 border-r border-[var(--erp-hairline)] font-sans">
                    <input
                      type="text"
                      value={line.account}
                      onChange={e => updateLine(line.id, 'account', e.target.value)}
                      className="w-full bg-transparent text-[var(--erp-text)] font-medium focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-2 border-r border-[var(--erp-hairline)] text-right">
                    <input
                      type="number"
                      step="0.01"
                      value={line.debit || ''}
                      placeholder="0.00"
                      onChange={e => updateLine(line.id, 'debit', e.target.value)}
                      className="w-full bg-transparent text-right font-mono text-[var(--erp-text)] focus:outline-none focus:text-[var(--erp-gold)]"
                    />
                  </td>
                  <td className="px-3 py-2 border-r border-[var(--erp-hairline)] text-right">
                    <input
                      type="number"
                      step="0.01"
                      value={line.credit || ''}
                      placeholder="0.00"
                      onChange={e => updateLine(line.id, 'credit', e.target.value)}
                      className="w-full bg-transparent text-right font-mono text-[var(--erp-text)] focus:outline-none focus:text-[var(--erp-gold)]"
                    />
                  </td>
                  <td className="px-3 py-2 border-r border-[var(--erp-hairline)] font-sans">
                    <input
                      type="text"
                      value={line.narration}
                      onChange={e => updateLine(line.id, 'narration', e.target.value)}
                      placeholder="Line remark..."
                      className="w-full bg-transparent text-xs text-[var(--erp-muted)] focus:text-[var(--erp-text)] focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => removeLine(line.id)}
                      disabled={lines.length <= 2}
                      className="text-[var(--erp-muted)] hover:text-[var(--erp-negative)] disabled:opacity-20"
                    >
                      <Trash2 className="w-3.5 h-3.5 mx-auto" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-[var(--erp-surface-2)] border-t border-[var(--erp-hairline-strong)] font-mono text-xs font-semibold">
              <tr>
                <td colSpan={2} className="px-3 py-2.5 border-r border-[var(--erp-hairline)]">
                  <button
                    type="button"
                    onClick={addLine}
                    className="text-xs text-[var(--erp-gold)] hover:underline flex items-center gap-1 font-sans"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Journal Ledger Line
                  </button>
                </td>
                <td className="px-3 py-2.5 border-r border-[var(--erp-hairline)] text-right text-[var(--erp-text)]">
                  ₹{totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-3 py-2.5 border-r border-[var(--erp-hairline)] text-right text-[var(--erp-text)]">
                  ₹{totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>
                <td colSpan={2} className="px-3 py-2.5 text-[var(--erp-muted)]">
                  {isBalanced ? 'Balanced' : `Variance: ₹${difference.toFixed(2)}`}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </form>
    </div>
  );
};
