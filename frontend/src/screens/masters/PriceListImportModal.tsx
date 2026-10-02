import React, { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Upload, X } from 'lucide-react';
import { FileDropZone } from '../../components/common/FileDropZone';
import { notifyApiError, notifySuccess } from '../../services/notify';
import { acquireSaveLock, releaseSaveLock } from '../../services/saveLock';
import { num } from '../../services/mastersApi';
import { PriceListImportPreview, priceListsApi } from '../../services/priceListsApi';

type Step = 'setup' | 'preview';

export const PriceListImportModal: React.FC<{ onClose: () => void; onImported: () => void }> = ({ onClose, onImported }) => {
  const [step, setStep] = useState<Step>('setup');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PriceListImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const savingLock = useMemo(() => ({ current: false }), []);

  const runPreview = async () => {
    if (!file) { setFileError('Select an Excel file.'); return; }
    setBusy(true); setFileError('');
    try { setPreview(await priceListsApi.importPreview(file)); setExpanded({}); setStep('preview'); }
    catch (error) { notifyApiError(error, 'Could not preview the import file.'); }
    finally { setBusy(false); }
  };

  const confirmImport = async () => {
    if (!preview?.importable.length || !acquireSaveLock(savingLock)) return;
    setBusy(true);
    try {
      const result = await priceListsApi.importCommit(preview.preview_token, preview.importable.map(group => group.import_key));
      notifySuccess(`${result.created_count} Price Lists imported as Draft. Review and activate from the Price Lists screen.`);
      onImported();
    } catch (error) { notifyApiError(error, 'Import was not committed.'); }
    finally { setBusy(false); releaseSaveLock(savingLock); }
  };

  const entryCount = preview?.importable.reduce((count, group) => count + group.entries.length, 0) || 0;

  return <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"><div className="w-full max-w-6xl max-h-[92vh] overflow-y-auto bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-6 space-y-5">
    <div className="flex justify-between items-start border-b border-[var(--erp-hairline)] pb-3 sticky top-0 bg-[var(--erp-surface)] z-10"><div><h3 className="font-display text-lg font-bold flex items-center gap-2"><Upload className="w-4 h-4 text-[var(--erp-gold)]" /> Import Price List</h3><p className="text-xs font-mono text-[var(--erp-muted)] mt-1">{step === 'setup' ? 'Step 1 of 2 - Upload file' : 'Step 2 of 2 - Preview before commit'}</p></div><button type="button" title="Close" onClick={onClose}><X className="w-4 h-4" /></button></div>
    {step === 'setup' ? <div className="space-y-5"><p className="text-sm text-[var(--erp-muted)]">Existing Brand and Product records are matched by code. Missing records are excluded and never created.</p><FileDropZone id="price-list-import-file" label="Source file" required error={fileError} helper="Excel (.xlsx) - Price List sheet" accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" file={file} onChange={next => { setFile(next); setFileError(''); }} /><div className="flex justify-end gap-3 pt-2 border-t border-[var(--erp-hairline)]"><button type="button" onClick={onClose} className="px-4 py-2 border border-[var(--erp-hairline)] text-xs font-mono">Cancel</button><button type="button" disabled={busy} onClick={() => void runPreview()} className="px-5 py-2 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold">{busy ? 'Analysing...' : 'Preview import'}</button></div></div> : null}
    {step === 'preview' && preview ? <div className="space-y-5">{preview.warnings.length ? <section className="border border-[rgba(201,162,78,0.45)] bg-[rgba(201,162,78,0.08)] p-3 text-xs"><p className="font-mono uppercase tracking-wider text-[var(--erp-gold)] mb-1">Warnings</p>{preview.warnings.map(warning => <p key={warning}>{warning}</p>)}</section> : null}
      <section><h4 className="text-[11px] font-mono uppercase tracking-wider text-[var(--erp-gold)] border-b border-[var(--erp-hairline)] pb-1 mb-3">Will Import ({preview.importable.length} price lists, {entryCount} entries)</h4>{preview.importable.length ? <div className="overflow-x-auto border border-[var(--erp-hairline)]"><table className="w-full text-left text-xs"><thead className="bg-[var(--erp-surface-2)] font-mono text-[10px] uppercase text-[var(--erp-muted)]"><tr><th className="px-3 py-2 w-8" /><th className="px-3 py-2">Brand</th><th className="px-3 py-2">Season</th><th className="px-3 py-2">Valid From - To</th><th className="px-3 py-2 text-right">Entries</th></tr></thead><tbody>{preview.importable.map(group => <React.Fragment key={group.import_key}><tr className="border-t border-[var(--erp-hairline)]"><td className="px-3 py-2"><button type="button" aria-label={`Toggle ${group.season_label}`} onClick={() => setExpanded(prev => ({ ...prev, [group.import_key]: !prev[group.import_key] }))}>{expanded[group.import_key] ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}</button></td><td className="px-3 py-2">{group.brand_name} <span className="font-mono text-[var(--erp-muted)]">({group.brand_code})</span></td><td className="px-3 py-2 font-medium">{group.season_label}</td><td className="px-3 py-2 font-mono">{group.valid_from} → {group.valid_to}</td><td className="px-3 py-2 text-right font-mono">{group.entries.length}</td></tr>{expanded[group.import_key] ? <tr className="bg-[var(--erp-surface-2)]"><td /><td colSpan={4} className="px-3 py-2"><table className="w-full"><thead><tr className="font-mono text-[10px] uppercase text-[var(--erp-muted)]"><th className="text-left py-1">Product</th><th className="text-right py-1">Length</th><th className="text-left py-1">Basis</th><th className="text-right py-1">Price</th><th className="text-right py-1">Per Meter</th><th className="text-right py-1">Per Taka</th><th className="text-right py-1">Taka Qty</th></tr></thead><tbody>{group.entries.map(entry => <tr key={`${group.import_key}-${entry.source_row}`}><td className="py-1">{entry.product_name} <span className="font-mono text-[var(--erp-muted)]">({entry.product_code})</span></td><td className="py-1 text-right font-mono">{num(entry.taka_length_meters).toFixed(3)}</td><td className="py-1">{entry.price_basis}</td><td className="py-1 text-right font-mono">₹{num(entry.price_value).toFixed(2)}</td><td className="py-1 text-right font-mono">₹{num(entry.price_per_meter).toFixed(2)}</td><td className="py-1 text-right font-mono">₹{num(entry.price_per_taka).toFixed(2)}</td><td className="py-1 text-right font-mono">{entry.taka_quantity ?? '-'}</td></tr>)}</tbody></table></td></tr> : null}</React.Fragment>)}</tbody></table></div> : <p className="text-sm text-[var(--erp-muted)]">No price lists can be imported.</p>}</section>
      {preview.excluded.length ? <section className="border border-[rgba(217,99,90,0.45)] bg-[rgba(217,99,90,0.08)] p-3"><h4 className="text-[11px] font-mono uppercase tracking-wider text-[var(--erp-negative)] border-b border-[rgba(217,99,90,0.35)] pb-1 mb-3 flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5" /> Will NOT Import ({preview.excluded.length})</h4><table className="w-full text-left text-xs"><thead className="font-mono text-[10px] uppercase text-[var(--erp-negative)]"><tr><th className="px-2 py-2">Row</th><th className="px-2 py-2">Brand</th><th className="px-2 py-2">Product</th><th className="px-2 py-2">Reason</th></tr></thead><tbody>{preview.excluded.map(row => <tr key={`${row.source_row}-${row.product_code}`} className="border-t border-[rgba(217,99,90,0.25)]"><td className="px-2 py-2 font-mono">{row.source_row}</td><td className="px-2 py-2">{row.brand_code}</td><td className="px-2 py-2 font-mono">{row.product_code}</td><td className="px-2 py-2 text-[var(--erp-negative)]">{row.reason}</td></tr>)}</tbody></table></section> : null}
      <div className="flex justify-end gap-3 pt-2 border-t border-[var(--erp-hairline)]"><button type="button" onClick={onClose} className="px-4 py-2 border border-[var(--erp-hairline)] text-xs font-mono">Cancel</button><button type="button" disabled={busy || !preview.importable.length} onClick={() => void confirmImport()} className="px-5 py-2 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold disabled:opacity-40">{busy ? 'Importing...' : `Confirm Import (${preview.importable.length} price lists, ${entryCount} entries, ${preview.excluded.length} excluded)`}</button></div>
    </div> : null}
  </div></div>;
};