import React, { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Upload, X } from 'lucide-react';
import { FileDropZone } from '../../components/common/FileDropZone';
import { notifyApiError, notifySuccess } from '../../services/notify';
import { REQUIRED_MSG } from '../../services/requiredFields';
import { acquireSaveLock, releaseSaveLock } from '../../services/saveLock';
import { num } from '../../services/mastersApi';
import {
  DispatchImportCommitResult,
  DispatchImportable,
  DispatchImportPreview,
  DispatchImportSkipped,
  dispatchesApi,
} from '../../services/dispatchesApi';

type Step = 'setup' | 'preview';

export interface DispatchImportModalProps {
  onClose: () => void;
  onImported: (result: DispatchImportCommitResult) => void;
}

function groupByPo(rows: DispatchImportable[]): { po_number: string; rows: DispatchImportable[] }[] {
  const order: string[] = [];
  const map = new Map<string, DispatchImportable[]>();
  for (const row of rows) {
    const key = row.po_number || row.order_code;
    if (!map.has(key)) {
      order.push(key);
      map.set(key, []);
    }
    map.get(key)!.push(row);
  }
  return order.map(po_number => ({ po_number, rows: map.get(po_number)! }));
}

function groupExcludedByReason(rows: DispatchImportPreview['excluded']) {
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const existing = groups.get(row.reason) || [];
    groups.set(row.reason, existing.concat(row.source_rows));
  }
  return Array.from(groups, ([reason, rowNumbers]) => ({
    reason,
    rowNumbers: Array.from(new Set(rowNumbers)).sort((a, b) => a - b),
    groupCount: rows.filter(row => row.reason === reason).length,
  }));
}

function formatRows(rowNumbers: number[]): string {
  const visible = rowNumbers.slice(0, 20).join(', ');
  const remaining = rowNumbers.length - Math.min(rowNumbers.length, 20);
  return remaining > 0 ? `${visible} and ${remaining} more` : visible;
}

function skippedRowCount(rows: DispatchImportSkipped[]): number {
  return rows.reduce((total, row) => total + row.row_numbers.length, 0);
}

export const DispatchImportModal: React.FC<DispatchImportModalProps> = ({ onClose, onImported }) => {
  const savingLock = useMemo(() => ({ current: false }), []);
  const [step, setStep] = useState<Step>('setup');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState('');
  const [preview, setPreview] = useState<DispatchImportPreview | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const runPreview = async () => {
    if (!file) {
      setFileError(REQUIRED_MSG);
      return;
    }
    setFileError('');
    setBusy(true);
    try {
      const result = await dispatchesApi.importPreview(file);
      setPreview(result);
      setExpanded({});
      setStep('preview');
    } catch (err) {
      notifyApiError(err, 'Could not preview the dispatch file.');
    } finally {
      setBusy(false);
    }
  };

  const confirmImport = async () => {
    if (!preview || !preview.importable.length) return;
    if (!acquireSaveLock(savingLock)) return;
    setBusy(true);
    try {
      const result = await dispatchesApi.importCommit({
        previewToken: preview.preview_token,
        groupKeys: preview.importable.map(row => row.group_key),
      });
      notifySuccess(
        `${result.created_count} dispatch${result.created_count === 1 ? '' : 'es'} imported. ${result.excluded_count} excluded.`,
      );
      onImported(result);
    } catch (err) {
      notifyApiError(err, 'Import was not committed.');
    } finally {
      setBusy(false);
      releaseSaveLock(savingLock);
    }
  };

  const toggle = (key: string) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const byPo = preview ? groupByPo(preview.importable) : [];
  const excludedByReason = preview ? groupExcludedByReason(preview.excluded) : [];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="w-full max-w-5xl max-h-[92vh] overflow-y-auto bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-6 space-y-5">
        <div className="flex justify-between items-start border-b border-[var(--erp-hairline)] pb-3 sticky top-0 bg-[var(--erp-surface)] z-10">
          <div>
            <h3 className="font-display text-lg font-bold flex items-center gap-2">
              <Upload className="w-4 h-4 text-[var(--erp-gold)]" /> Import Dispatches
            </h3>
            <p className="text-xs font-mono text-[var(--erp-muted)] mt-1">
              {step === 'setup' ? 'Step 1 of 2 — Source file' : 'Step 2 of 2 — Preview before commit'}
            </p>
          </div>
          <button type="button" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        {step === 'setup' && (
          <div className="space-y-5">
            <p className="text-sm text-[var(--erp-muted)]">
              Rows are matched to existing Purchase Orders using the detected dispatch format. No new POs are created.
              Value, tax and invoice-value columns are ignored.
            </p>
            <FileDropZone
              id="dispatch-import-file"
              label="Source file"
              required
              error={fileError}
              helper="Excel or delimited text (.xlsx, .xls, .txt). The format is detected from the file headers."
              accept=".xlsx,.xlsm,.xls,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain"
              file={file}
              onChange={next => {
                setFile(next);
                if (next) setFileError('');
              }}
            />
            <div className="flex justify-end gap-3 pt-2 border-t border-[var(--erp-hairline)]">
              <button type="button" onClick={onClose} className="px-4 py-2 border border-[var(--erp-hairline)] text-xs font-mono">Cancel</button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runPreview()}
                className="px-5 py-2 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold disabled:opacity-40"
              >
                {busy ? 'Reading…' : 'Preview import'}
              </button>
            </div>
          </div>
        )}

        {step === 'preview' && preview && (
          <div className="space-y-5">
            <p className="text-sm font-mono text-[var(--erp-muted)]">
              {preview.format_name ? `${preview.format_name} · ` : ''}{preview.counts?.importable ?? preview.importable.length} dispatches importable, {preview.counts?.excluded ?? preview.excluded.length} groups excluded, {preview.counts?.sample ?? 0} sample rows, {skippedRowCount(preview.skipped)} rows skipped.
            </p>

            <section>
              <h4 className="text-[11px] font-mono uppercase tracking-wider text-[var(--erp-gold)] border-b border-[var(--erp-hairline)] pb-1 mb-3">
                Will Import ({preview.importable.length})
              </h4>
              {preview.importable.length === 0 ? (
                <p className="text-sm text-[var(--erp-muted)]">No dispatches can be imported from this file.</p>
              ) : (
                <div className="overflow-x-auto border border-[var(--erp-hairline)]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[var(--erp-surface-2)] font-mono text-[10px] uppercase tracking-wider text-[var(--erp-muted)]">
                      <tr>
                        <th className="px-3 py-2 w-8" />
                        <th className="px-3 py-2">PO Number</th>
                        <th className="px-3 py-2">Branch / Party</th>
                        <th className="px-3 py-2">Invoice / LR</th>
                        <th className="px-3 py-2">Transport</th>
                        <th className="px-3 py-2 text-right">Lines</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byPo.map(group => (
                        <React.Fragment key={group.po_number}>
                          <tr className="bg-[var(--erp-surface-2)] border-t border-[var(--erp-hairline-strong)]">
                            <td colSpan={6} className="px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--erp-gold)]">
                              Order {group.po_number} · {group.rows.length} dispatch{group.rows.length === 1 ? '' : 'es'}
                            </td>
                          </tr>
                          {group.rows.map(row => (
                            <React.Fragment key={row.group_key}>
                              <tr className="border-t border-[var(--erp-hairline)]">
                                <td className="px-3 py-2">
                                  <button type="button" onClick={() => toggle(row.group_key)} className="text-[var(--erp-muted)]">
                                    {expanded[row.group_key] ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                  </button>
                                </td>
                                <td className="px-3 py-2 font-mono text-[var(--erp-gold)]">{row.po_number}</td>
                                <td className="px-3 py-2">{row.po_entity_name} · {row.customer_name} <span className="font-mono text-[var(--erp-muted)]">({row.customer_code})</span></td>
                                <td className="px-3 py-2 font-mono">{row.invoice_no} · {row.lr_number}</td>
                                <td className="px-3 py-2">{row.transporter || '—'}</td>
                                <td className="px-3 py-2 text-right font-mono">{row.line_count}</td>
                              </tr>
                              {expanded[row.group_key] ? (
                                <tr className="bg-[var(--erp-surface-2)]">
                                  <td />
                                  <td colSpan={5} className="px-3 py-2">
                                    <table className="w-full">
                                      <thead>
                                        <tr className="font-mono text-[10px] uppercase text-[var(--erp-muted)]">
                                          <th className="text-left py-1">Product / description</th>
                                          <th className="text-right py-1 w-24">Qty</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {row.lines.map((line, index) => (
                                          <tr key={`${row.group_key}-${index}`}>
                                            <td className="py-0.5 font-mono">{line.po_line_description || line.description}</td>
                                            <td className="py-0.5 text-right font-mono">{num(line.quantity).toFixed(2)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              ) : null}
                            </React.Fragment>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {preview.excluded.length > 0 || preview.skipped.length > 0 ? (
              <section className="border border-[rgba(217,99,90,0.45)] bg-[rgba(217,99,90,0.08)] p-3">
                <h4 className="text-[11px] font-mono uppercase tracking-wider text-[var(--erp-negative)] border-b border-[rgba(217,99,90,0.35)] pb-1 mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5" /> Excluded and skipped rows
                </h4>
                <div className="space-y-2 text-xs">
                  {[...preview.skipped.map(row => ({
                    reason: row.reason,
                    rowNumbers: row.row_numbers,
                    label: 'skipped',
                  })), ...excludedByReason.map(row => ({
                    reason: row.reason,
                    rowNumbers: row.rowNumbers,
                    label: 'groups excluded',
                    count: row.groupCount,
                  }))].map(row => {
                    const key = `${row.label}-${row.reason}`;
                    const count = 'count' in row ? row.count : row.rowNumbers.length;
                    return (
                      <div key={key} className="border-t border-[rgba(217,99,90,0.25)] pt-2">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[var(--erp-negative)]">
                            {count} {row.label}: {row.reason}
                          </span>
                          <button type="button" onClick={() => toggle(key)} className="font-mono text-[var(--erp-negative)] whitespace-nowrap">
                            {expanded[key] ? 'Hide rows' : 'Show rows'}
                          </button>
                        </div>
                        {expanded[key] ? (
                          <p className="mt-1 font-mono text-[var(--erp-muted)]">
                            Rows {formatRows(row.rowNumbers)}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <div className="flex justify-end gap-3 pt-2 border-t border-[var(--erp-hairline)]">
              <button type="button" onClick={() => setStep('setup')} className="px-4 py-2 border border-[var(--erp-hairline)] text-xs font-mono">Back</button>
              <button type="button" onClick={onClose} className="px-4 py-2 border border-[var(--erp-hairline)] text-xs font-mono">Cancel</button>
              <button
                type="button"
                disabled={busy || preview.importable.length === 0}
                onClick={() => void confirmImport()}
                className="px-5 py-2 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold disabled:opacity-40"
              >
                {busy
                  ? 'Importing…'
                  : `Confirm Import (${preview.importable.length} dispatches, ${preview.excluded.length} excluded)`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
