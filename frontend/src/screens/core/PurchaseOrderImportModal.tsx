import React, { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Copy, Download, Upload, X } from 'lucide-react';
import { FormField, RequiredLegend } from '../../components/common/FormControls';
import { FileDropZone } from '../../components/common/FileDropZone';
import { BrandRow } from '../../services/brandsApi';
import { EntityRow } from '../../services/entitiesApi';
import { notifyApiError, notifySuccess } from '../../services/notify';
import {
  PoImportCommitResult,
  PoImportExcluded,
  PoImportPreview,
  purchaseOrdersApi,
} from '../../services/purchaseOrdersApi';
import { acquireSaveLock, releaseSaveLock } from '../../services/saveLock';
import { clearFieldMessage, REQUIRED_MSG } from '../../services/requiredFields';
import { num } from '../../services/mastersApi';

type Step = 'setup' | 'preview';

export interface PurchaseOrderImportModalProps {
  entities: EntityRow[];
  brands: BrandRow[];
  onClose: () => void;
  onImported: (result: PoImportCommitResult) => void;
}

function excludedReportText(rows: PoImportExcluded[]): string {
  return rows.map(row => `${row.order_no}\t${row.customer_code}\t${row.reason}`).join('\n');
}

export const PurchaseOrderImportModal: React.FC<PurchaseOrderImportModalProps> = ({
  entities,
  brands,
  onClose,
  onImported,
}) => {
  const savingLock = useMemo(() => ({ current: false }), []);
  const [step, setStep] = useState<Step>('setup');
  const [entityId, setEntityId] = useState<number | ''>('');
  const [brandId, setBrandId] = useState<number | ''>('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [fieldMessages, setFieldMessages] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<PoImportPreview | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const activeBrands = brands.filter(b => b.status === 'Active');
  const selectedEntity = entities.find(e => e.id === entityId);

  const runPreview = async () => {
    const messages: Record<string, string> = {};
    if (!entityId) messages.entity_id = 'Select an entity.';
    if (!brandId) messages.brand_id = 'Select a brand.';
    if (!file) messages.file = REQUIRED_MSG;
    setFieldMessages(messages);
    if (Object.keys(messages).length) return;
    setBusy(true);
    try {
      const result = await purchaseOrdersApi.importPreview({
        entityId: Number(entityId),
        brandId: Number(brandId),
        file: file as File,
      });
      setPreview(result);
      setExpanded({});
      setStep('preview');
    } catch (err) {
      notifyApiError(err, 'Could not preview the import file.');
    } finally {
      setBusy(false);
    }
  };

  const confirmImport = async () => {
    if (!preview || !entityId || !brandId) return;
    if (!preview.importable.length) return;
    if (!acquireSaveLock(savingLock)) return;
    setBusy(true);
    try {
      const result = await purchaseOrdersApi.importCommit({
        previewToken: preview.preview_token,
        entityId: Number(entityId),
        brandId: Number(brandId),
        orderNos: preview.importable.map(row => row.order_no),
      });
      notifySuccess(
        `${result.created_count} Purchase Orders imported as Draft. ${result.excluded_count} excluded — see report.`,
      );
      onImported(result);
    } catch (err) {
      notifyApiError(err, 'Import was not committed.');
    } finally {
      setBusy(false);
      releaseSaveLock(savingLock);
    }
  };

  const toggle = (orderNo: string) => {
    setExpanded(prev => ({ ...prev, [orderNo]: !prev[orderNo] }));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="w-full max-w-5xl max-h-[92vh] overflow-y-auto bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-6 space-y-5">
        <div className="flex justify-between items-start border-b border-[var(--erp-hairline)] pb-3 sticky top-0 bg-[var(--erp-surface)] z-10">
          <div>
            <h3 className="font-display text-lg font-bold flex items-center gap-2">
              <Upload className="w-4 h-4 text-[var(--erp-gold)]" /> Import Purchase Orders
            </h3>
            <p className="text-xs font-mono text-[var(--erp-muted)] mt-1">
              {step === 'setup' ? 'Step 1 of 2 — Entity, brand and file' : 'Step 2 of 2 — Preview before commit'}
            </p>
          </div>
          <button type="button" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        {step === 'setup' && (
          <div className="space-y-5">
            <RequiredLegend />
            <p className="text-sm text-[var(--erp-muted)]">
              Customer codes are matched only under the entity you select. Nothing is saved until you confirm the preview.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Entity" htmlFor="po-import-entity" required error={fieldMessages.entity_id}>
                <select
                  id="po-import-entity"
                  value={entityId}
                  onChange={e => setEntityId(e.target.value ? Number(e.target.value) : '')}
                  className={`w-full px-3 py-2 text-sm bg-[var(--erp-surface)] border text-[var(--erp-text)] ${
                    fieldMessages.entity_id ? 'border-[var(--erp-negative)]' : 'border-[var(--erp-hairline-strong)]'
                  }`}
                >
                  <option value="">Select entity…</option>
                  {entities.map(ent => (
                    <option key={ent.id} value={ent.id}>{ent.short_code} · {ent.entity_name}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Brand" htmlFor="po-import-brand" required error={fieldMessages.brand_id}>
                <select
                  id="po-import-brand"
                  value={brandId}
                  onChange={e => setBrandId(e.target.value ? Number(e.target.value) : '')}
                  className={`w-full px-3 py-2 text-sm bg-[var(--erp-surface)] border text-[var(--erp-text)] ${
                    fieldMessages.brand_id ? 'border-[var(--erp-negative)]' : 'border-[var(--erp-hairline-strong)]'
                  }`}
                >
                  <option value="">Select brand…</option>
                  {activeBrands.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.brand_code} · {b.brand_name} ({b.order_method})
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
            <FileDropZone
              id="po-import-file"
              label="Source file"
              required
              error={fieldMessages.file}
              helper="Excel (.xlsx) — e.g. OCM_PO.xlsx"
              accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              file={file}
              onChange={next => {
                setFile(next);
                setFieldMessages(prev => clearFieldMessage(prev, 'file'));
              }}
            />
            <div className="flex justify-end gap-3 pt-2 border-t border-[var(--erp-hairline)]">
              <button type="button" onClick={onClose} className="px-4 py-2 border border-[var(--erp-hairline)] text-xs font-mono">Cancel</button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runPreview()}
                className="px-5 py-2 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold"
              >
                {busy ? 'Analysing…' : 'Preview import'}
              </button>
            </div>
          </div>
        )}

        {step === 'preview' && preview && (
          <div className="space-y-5">
            <div className="border border-[rgba(201,162,78,0.45)] bg-[rgba(201,162,78,0.08)] p-3 text-xs">
              <p className="font-mono uppercase tracking-wider text-[var(--erp-gold)] mb-1">Warnings</p>
              <ul className="space-y-1 text-[var(--erp-text)]">
                {preview.warnings.map(item => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="mt-2 font-semibold text-[var(--erp-gold)]">
                Rate not provided — all imported lines will need rates entered manually before any PO can be submitted.
              </p>
            </div>

            <section>
              <h4 className="text-[11px] font-mono uppercase tracking-wider text-[var(--erp-gold)] border-b border-[var(--erp-hairline)] pb-1 mb-3">
                Will Import ({preview.importable.length})
              </h4>
              {preview.importable.length === 0 ? (
                <p className="text-sm text-[var(--erp-muted)]">No purchase orders can be imported for this entity and file.</p>
              ) : (
                <div className="overflow-x-auto border border-[var(--erp-hairline)]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[var(--erp-surface-2)] font-mono text-[10px] uppercase tracking-wider text-[var(--erp-muted)]">
                      <tr>
                        <th className="px-3 py-2 w-8" />
                        <th className="px-3 py-2">Order No</th>
                        <th className="px-3 py-2">Customer</th>
                        <th className="px-3 py-2 text-right">Line count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.importable.map(row => (
                        <React.Fragment key={row.order_no}>
                          <tr className="border-t border-[var(--erp-hairline)]">
                            <td className="px-3 py-2">
                              <button type="button" onClick={() => toggle(row.order_no)} className="text-[var(--erp-muted)]">
                                {expanded[row.order_no] ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                              </button>
                            </td>
                            <td className="px-3 py-2 font-mono text-[var(--erp-gold)]">{row.order_no}</td>
                            <td className="px-3 py-2">{row.customer_name} <span className="font-mono text-[var(--erp-muted)]">({row.customer_code})</span></td>
                            <td className="px-3 py-2 text-right font-mono">{row.line_count}</td>
                          </tr>
                          {expanded[row.order_no] ? (
                            <tr className="bg-[var(--erp-surface-2)]">
                              <td />
                              <td colSpan={3} className="px-3 py-2">
                                <table className="w-full">
                                  <thead>
                                    <tr className="font-mono text-[10px] uppercase text-[var(--erp-muted)]">
                                      <th className="text-left py-1">Description</th>
                                      <th className="text-right py-1 w-24">Qty</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {row.lines.map((line, index) => (
                                      <tr key={`${row.order_no}-${index}`}>
                                        <td className="py-0.5 font-mono">{line.description}</td>
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
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {preview.excluded.length > 0 ? (
            <section className="border border-[rgba(217,99,90,0.45)] bg-[rgba(217,99,90,0.08)] p-3">
              <h4 className="text-[11px] font-mono uppercase tracking-wider text-[var(--erp-negative)] border-b border-[rgba(217,99,90,0.35)] pb-1 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5" /> Will NOT Import — Review Required ({preview.excluded.length})
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="font-mono text-[10px] uppercase tracking-wider text-[var(--erp-negative)]">
                    <tr>
                      <th className="px-2 py-2">Order No</th>
                      <th className="px-2 py-2">Customer</th>
                      <th className="px-2 py-2">Reason</th>
                      <th className="px-2 py-2 text-right">Lines</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.excluded.map(row => (
                      <tr key={row.order_no} className="border-t border-[rgba(217,99,90,0.25)]">
                        <td className="px-2 py-2 font-mono">{row.order_no}</td>
                        <td className="px-2 py-2">{row.customer_name} <span className="font-mono">({row.customer_code})</span></td>
                        <td className="px-2 py-2 text-[var(--erp-negative)]">{row.reason}</td>
                        <td className="px-2 py-2 text-right font-mono">{row.line_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            ) : null}

            <div className="flex justify-end gap-3 pt-2 border-t border-[var(--erp-hairline)]">
              <button type="button" onClick={onClose} className="px-4 py-2 border border-[var(--erp-hairline)] text-xs font-mono">Cancel</button>
              <button
                type="button"
                disabled={busy || preview.importable.length === 0}
                onClick={() => void confirmImport()}
                className="px-5 py-2 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold disabled:opacity-40"
              >
                {busy
                  ? 'Importing…'
                  : `Confirm Import (${preview.importable.length} POs, ${preview.excluded.length} excluded)`}
              </button>
            </div>
            {selectedEntity ? (
              <p className="text-[11px] font-mono text-[var(--erp-muted)]">
                Entity {selectedEntity.entity_name} · rates will be blank on every imported Draft line.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

export function ImportExcludedReport({
  excluded,
  onDismiss,
}: {
  excluded: PoImportExcluded[];
  onDismiss: () => void;
}) {
  if (!excluded.length) return null;
  const text = excludedReportText(excluded);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      notifySuccess('Excluded order list copied.');
    } catch {
      notifyApiError(new Error('Could not copy the excluded list.'));
    }
  };
  const download = () => {
    const blob = new Blob([`Order No\tCustomer Code\tReason\n${text}`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'po-import-excluded.txt';
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="border border-[rgba(217,99,90,0.45)] bg-[rgba(217,99,90,0.08)] p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-mono uppercase tracking-wider text-[var(--erp-negative)]">
          Excluded from last import ({excluded.length})
        </p>
        <button type="button" onClick={onDismiss} className="text-[var(--erp-muted)]"><X className="w-3.5 h-3.5" /></button>
      </div>
      <pre className="text-[11px] font-mono whitespace-pre-wrap text-[var(--erp-text)] max-h-40 overflow-y-auto">{text}</pre>
      <div className="flex gap-2">
        <button type="button" onClick={() => void copy()} className="px-3 py-1.5 text-[11px] font-mono border border-[var(--erp-hairline)] flex items-center gap-1">
          <Copy className="w-3 h-3" /> Copy list
        </button>
        <button type="button" onClick={download} className="px-3 py-1.5 text-[11px] font-mono border border-[var(--erp-hairline)] flex items-center gap-1">
          <Download className="w-3 h-3" /> Download
        </button>
      </div>
    </div>
  );
}
