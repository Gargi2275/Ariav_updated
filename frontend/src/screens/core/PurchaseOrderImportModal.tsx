import React, { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Copy, Download, LoaderCircle, Upload, X } from 'lucide-react';
import { FieldError } from '../../components/common/FormControls';
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
import { customersApi, CustomerRow } from '../../services/customersApi';
import { useErp } from '../../context/ErpContext';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';

type Step = 'setup' | 'preview';

export interface PurchaseOrderImportModalProps {
  entities: EntityRow[];
  brands: BrandRow[];
  selectedEntityId: number | 'all';
  initialBrandId?: number | '';
  onConfigureBranch?: () => void;
  onClose: () => void;
  onImported: (result: PoImportCommitResult) => void;
}

function excludedReportText(rows: PoImportExcluded[]): string {
  return rows.map(row => `${row.order_no}\t${row.customer_code}\t${row.reason}`).join('\n');
}

export const PurchaseOrderImportModal: React.FC<PurchaseOrderImportModalProps> = ({
  entities,
  brands,
  selectedEntityId,
  initialBrandId = '',
  onConfigureBranch,
  onClose,
  onImported,
}) => {
  const savingLock = useMemo(() => ({ current: false }), []);
  const [step, setStep] = useState<Step>('setup');
  const [brandId, setBrandId] = useState<number | ''>(initialBrandId);
  const [formatId, setFormatId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [fieldMessages, setFieldMessages] = useState<Record<string, string>>({});
  const [previewError, setPreviewError] = useState('');
  const [previewSuccess, setPreviewSuccess] = useState('');
  const [preview, setPreview] = useState<PoImportPreview | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [skippedOpen, setSkippedOpen] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, Record<string, unknown>>>({});
  const [partyOptions, setPartyOptions] = useState<CustomerRow[]>([]);
  const [newPartyBranches, setNewPartyBranches] = useState<number[]>([]);
  const [showPartyConfirmation, setShowPartyConfirmation] = useState(false);
  const contextVersion = React.useRef(0);
  const previousEntityId = React.useRef<number | 'all' | undefined>(undefined);
  const { userRole } = useErp();

  const entityId = selectedEntityId === 'all' ? '' : selectedEntityId;
  const selectedEntity = entities.find(e => e.id === entityId);
  const mappedBrandIds = useMemo(
    () => new Set((selectedEntity?.brand_ids || []).map(id => Number(id))),
    [selectedEntity],
  );
  const activeBrands = useMemo(() => brands.filter(b => (
    b.status === 'Active' && mappedBrandIds.has(Number(b.id))
  )), [brands, mappedBrandIds]);
  React.useEffect(() => {
    const entityChanged = previousEntityId.current !== undefined
      && previousEntityId.current !== selectedEntityId;
    previousEntityId.current = selectedEntityId;
    contextVersion.current += 1;
    setBrandId(current => activeBrands.some(brand => brand.id === current)
      ? current
      : activeBrands.length === 1 ? activeBrands[0].id : '');
    setFieldMessages({});
    setPreviewError('');
    setPreviewSuccess('');
    setPreview(null);
    setDecisions({});
    setStep('setup');
    setBusy(false);
    if (entityChanged) {
      setFile(null);
      setFormatId('');
      setPartyOptions([]);
      setNewPartyBranches([]);
    }
  }, [activeBrands, selectedEntityId]);

  const runPreview = async () => {
    const messages: Record<string, string> = {};
    if (!entityId) messages.entity_id = 'Select a branch in the global header.';
    if (!activeBrands.length && entityId) {
      messages.brand_id = 'No active brands are mapped to this branch. Configure Allowed Brands in Branch Master.';
    } else if (!brandId || !activeBrands.some(brand => brand.id === Number(brandId))) {
      messages.brand_id = 'Select an active brand mapped to this branch.';
    }
    if (!file) messages.file = REQUIRED_MSG;
    setFieldMessages(messages);
    setPreviewError('');
    setPreviewSuccess('');
    if (Object.keys(messages).length) return;
    const requestVersion = contextVersion.current;
    const requestEntityId = Number(entityId);
    const requestBrandId = Number(brandId);
    setBusy(true);
    try {
      const result = await purchaseOrdersApi.importPreview({
        entityId: requestEntityId,
        brandId: requestBrandId,
        file: file as File,
        formatId: formatId || undefined,
      });
      if (requestVersion !== contextVersion.current) return;
      setPreview(result);
      setDecisions({});
      setNewPartyBranches([Number(entityId)]);
      const customers = await customersApi.list({ entity_id: Number(entityId), status: 'Active' });
      if (requestVersion !== contextVersion.current) return;
      setPartyOptions(customers);
      setFormatId(result.format_id);
      setExpanded({});
      setStep('preview');
      setPreviewSuccess('Preview loaded successfully. Review the import details below.');
    } catch (err) {
      const parsed = notifyApiError(err, 'Could not preview the import file.');
      if (requestVersion === contextVersion.current) setPreviewError(parsed.message);
    } finally {
      if (requestVersion === contextVersion.current) setBusy(false);
    }
  };

  const overrideFormat = async (nextFormat: string) => {
    if (!entityId || !brandId || !file || !nextFormat) return;
    const requestVersion = contextVersion.current;
    const requestEntityId = Number(entityId);
    const requestBrandId = Number(brandId);
    setBusy(true);
    try {
      const result = await purchaseOrdersApi.importPreview({
        entityId: requestEntityId,
        brandId: requestBrandId,
        file,
        formatId: nextFormat,
      });
      if (requestVersion !== contextVersion.current) return;
      setPreview(result);
      setDecisions({});
      setNewPartyBranches([Number(entityId)]);
      const customers = await customersApi.list({ entity_id: Number(entityId), status: 'Active' });
      if (requestVersion !== contextVersion.current) return;
      setPartyOptions(customers);
      setFormatId(result.format_id);
      setExpanded({});
    } catch (err) {
      const parsed = notifyApiError(err, 'Could not apply the selected import format.');
      if (requestVersion === contextVersion.current) setPreviewError(parsed.message);
    } finally {
      if (requestVersion === contextVersion.current) setBusy(false);
    }
  };

  const executeImport = async () => {
    if (!preview || !entityId || !brandId) return;
    if (
      preview.entity_id !== Number(entityId)
      || preview.brand_id !== Number(brandId)
      || !activeBrands.some(brand => brand.id === Number(brandId))
    ) {
      setPreview(null);
      setStep('setup');
      notifyApiError(new Error('The branch or brand changed. Run the import preview again.'), 'Import preview expired.');
      return;
    }
    if (!preview.importable.length && !preview.unmatched_parties.length) return;
    if (preview.unmatched_parties.some(party => !decisions[party.code])) return;
    if (!acquireSaveLock(savingLock)) return;
    setBusy(true);
    try {
      const result = await purchaseOrdersApi.importCommit({
        previewToken: preview.preview_token,
        entityId: Number(entityId),
        brandId: Number(brandId),
        orderNos: preview.importable.map(row => row.order_no),
        decisions,
      });
      notifySuccess(
        `${result.created_count} Purchase Orders imported as Brand Accepted. ${result.excluded_count} excluded — see report.`,
      );
      onImported(result);
    } catch (err) {
      notifyApiError(err, 'Import was not committed.');
    } finally {
      setBusy(false);
      releaseSaveLock(savingLock);
    }
  };

  const confirmImport = () => {
    if (!preview || !entityId || !brandId) return;
    const hasPartyChanges = preview.unmatched_parties.some(party => ['create', 'link'].includes(String(decisions[party.code]?.action)));
    if (hasPartyChanges) {
      setShowPartyConfirmation(true);
      return;
    }
    void executeImport();
  };

  const setDecision = (code: string, decision: Record<string, unknown>) => {
    setDecisions(prev => ({ ...prev, [code]: decision }));
  };

  const updatePartyBranches = (code: string, branchIds: number[], primaryBranchId?: number) => {
    const primary = primaryBranchId || Number(decisions[code]?.primary_branch_id) || Number(entityId);
    setDecision(code, { ...decisions[code], action: 'create', branch_ids: branchIds, primary_branch_id: branchIds.includes(primary) ? primary : branchIds[0] });
  };

  const primarySkipReason = preview?.excluded.length
    ? (Object.entries(preview.excluded.reduce<Record<string, number>>((counts, row) => {
      counts[row.reason] = (counts[row.reason] || 0) + 1;
      return counts;
    }, {})) as Array<[string, number]>).sort((a, b) => b[1] - a[1])[0]
    : undefined;

  const toggle = (orderNo: string) => {
    setExpanded(prev => ({ ...prev, [orderNo]: !prev[orderNo] }));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="flex w-full max-w-4xl max-h-[90vh] flex-col overflow-hidden bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-5 shadow-xl">
        <div className="flex justify-between items-start border-b border-[var(--erp-hairline)] pb-3 sticky top-0 bg-[var(--erp-surface)] z-10">
          <div>
            <h3 className="font-display text-lg font-bold flex items-center gap-2">
              <Upload className="w-4 h-4 text-[var(--erp-gold)]" /> Import Purchase Orders
            </h3>
            <p className="text-xs font-mono text-[var(--erp-muted)] mt-1">
              {step === 'setup' ? 'Step 1 of 2 · Select brand and upload file' : 'Step 2 of 2 · Preview before commit'}
            </p>
          </div>
          <ConfirmDialog
            open={showPartyConfirmation}
            entityType="party"
            entityLabel="the selected Party changes"
            title="Confirm party changes"
            message="Review the new Parties and Branch links below before continuing the Purchase Order import."
            details={(
              <div className="space-y-3 text-sm text-[var(--erp-text)]">
                {preview?.unmatched_parties.filter(party => decisions[party.code]?.action === 'create').map(party => (
                  <div key={`new-${party.code}`}><span className="font-semibold">New Party:</span> {String(decisions[party.code]?.name || party.name)} ({String(decisions[party.code]?.code || party.code)}) — {selectedEntity?.short_code || 'selected Branch'}</div>
                ))}
                {preview?.unmatched_parties.filter(party => decisions[party.code]?.action === 'link').map(party => (
                  <div key={`link-${party.code}`}><span className="font-semibold">Link Party:</span> {party.existing_party_name || party.name} ({party.code}) → {selectedEntity?.short_code || 'selected Branch'}</div>
                ))}
              </div>
            )}
            confirmLabel="Confirm changes"
            busyLabel="Importing…"
            confirmTone="gold"
            onCancel={() => setShowPartyConfirmation(false)}
            onConfirm={async () => {
              setShowPartyConfirmation(false);
              await executeImport();
            }}
          />
          <button type="button" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        {step === 'setup' && (
          <div className="space-y-5">
              <p className="max-w-2xl text-sm leading-5 text-[var(--erp-muted)]">
                Customer codes are matched only under the active header branch. Nothing is saved until you confirm the preview.
              </p>
              <div className={`grid grid-cols-1 gap-4 items-stretch ${activeBrands.length === 1 ? '' : 'lg:grid-cols-2'}`}>
                {activeBrands.length !== 1 && (
                <section className="flex min-h-[190px] flex-col border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)] p-3.5">
                <div className="mb-3 flex items-center justify-between border-b border-[var(--erp-hairline)] pb-2">
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--erp-text)]">Brand</h4>
                    <p className="mt-1 text-[11px] text-[var(--erp-muted)]">Active brands allowed for this branch</p>
                  </div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--erp-muted)]">{activeBrands.length} available</span>
                </div>
                <div className="flex flex-1 flex-col gap-1">
                  <div className="space-y-2">
                    {activeBrands.length > 0 && (
                      <div role="radiogroup" aria-label="Available brands" className="grid grid-cols-1 gap-2">
                        {activeBrands.map(brand => (
                          <button key={brand.id} type="button" role="radio" aria-checked={brandId === brand.id} onClick={() => setBrandId(brand.id)} className={`flex min-h-14 items-center justify-between px-3 py-2.5 text-left text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--erp-gold)] ${brandId === brand.id ? 'border border-[var(--erp-gold)] bg-[var(--erp-gold)]/10 text-[var(--erp-text)]' : 'border border-[var(--erp-hairline)] bg-[var(--erp-surface)] text-[var(--erp-muted)] hover:border-[var(--erp-gold)]/60'}`}>
                            <span>
                              <span className="font-mono text-[var(--erp-gold)]">{brand.brand_code}</span>
                              <span className="mx-1 text-[var(--erp-muted)]">·</span>
                              <span className="font-medium">{brand.brand_name}</span>
                              <span className="ml-2 text-[11px] text-[var(--erp-muted)]">({brand.order_method})</span>
                            </span>
                            <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${brandId === brand.id ? 'bg-[var(--erp-gold)]' : 'border border-[var(--erp-muted)]'}`} />
                          </button>
                        ))}
                      </div>
                    )}
                    {!entityId && (
                      <p className="text-xs leading-5 text-[var(--erp-negative)]">
                        Select a branch in the global header before choosing a brand.
                      </p>
                    )}
                    {entityId && !activeBrands.length && (
                      <div className="text-xs leading-5 text-[var(--erp-negative)]">
                        <p>No active brands are mapped to this branch. Configure Allowed Brands in Branch Master.</p>
                        {onConfigureBranch && (
                          <button type="button" onClick={onConfigureBranch} className="mt-2 underline text-[var(--erp-gold)] focus:outline-none focus:ring-2 focus:ring-[var(--erp-gold)]">
                            Configure Allowed Brands in Branch Master
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <FieldError message={fieldMessages.brand_id} />
                </div>
              </section>
                )}
              <FileDropZone
                id="po-import-file"
                label="Source file"
                required
                error={fieldMessages.file}
                helper="Excel files (.xlsx)"
                accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                file={file}
                onChange={next => {
                  setFile(next);
                  setFieldMessages(prev => clearFieldMessage(prev, 'file'));
                  setPreviewError('');
                }}
                onFileRejected={message => setFieldMessages(prev => ({ ...prev, file: message }))}
                className="min-h-[190px] border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)] p-3.5"
              />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-[var(--erp-hairline)] pt-4">
              <button type="button" onClick={onClose} className="px-4 py-2 border border-[var(--erp-hairline)] text-xs font-mono">Cancel</button>
              <button
                type="button"
                disabled={busy || !entityId || !brandId || !file || !activeBrands.some(brand => brand.id === Number(brandId))}
                onClick={() => void runPreview()}
                className="px-5 py-2 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--erp-gold)] disabled:cursor-not-allowed disabled:bg-[var(--erp-hairline)] disabled:text-[var(--erp-muted)]"
                aria-disabled={busy || !entityId || !brandId || !file || !activeBrands.some(brand => brand.id === Number(brandId))}
                title={!activeBrands.length ? 'Configure an active brand mapping in Branch Master first.' : undefined}
              >
                {busy ? (
                  <span className="inline-flex items-center gap-2">
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    Preparing preview…
                  </span>
                ) : 'Preview Import'}
              </button>
            </div>
            {previewError ? (
              <div role="alert" className="border border-[var(--erp-negative)]/50 bg-[var(--erp-negative)]/10 px-3 py-2 text-xs text-[var(--erp-negative)]">
                {previewError}
              </div>
            ) : null}
          </div>
        )}

        {step === 'preview' && preview && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {previewSuccess ? (
              <div role="status" className="border border-[var(--erp-gold)]/50 bg-[var(--erp-gold)]/10 px-3 py-2 text-xs text-[var(--erp-text)]">
                {previewSuccess}
              </div>
            ) : null}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[
                ['Importable', preview.importable.length, 'border-emerald-600/30 bg-emerald-50 text-emerald-800'],
                ['Skipped', preview.excluded.length, preview.excluded.length ? 'border-[var(--erp-negative)]/30 bg-[var(--erp-negative)]/5 text-[var(--erp-negative)]' : 'border-[var(--erp-hairline)] bg-[var(--erp-surface-2)] text-[var(--erp-text)]'],
                ['New parties', preview.unmatched_parties.length, 'border-sky-600/30 bg-sky-50 text-sky-800'],
              ].map(([label, count, styles]) => (
                <div key={String(label)} className={`border px-3 py-2 ${styles}`}>
                  <p className="text-[10px] font-mono uppercase tracking-wider opacity-75">{label}</p>
                  <p className="mt-0.5 text-xl font-semibold">{count}</p>
                </div>
              ))}
            </div>
            {(preview.errors.length > 0 || (!preview.importable.length && preview.excluded.length > 0)) ? (
              <div role="alert" className="border border-[var(--erp-negative)]/40 bg-[var(--erp-negative)]/8 px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--erp-negative)]" />
                  <div>
                    <p className="text-sm font-semibold text-[var(--erp-negative)]">
                      {preview.importable.length ? 'Some purchase orders need review' : 'No purchase orders can be imported'}
                    </p>
                    <p className="mt-1 text-xs text-[var(--erp-negative)]">
                      {preview.importable.length ? `${preview.excluded.length} order${preview.excluded.length === 1 ? '' : 's'} will be skipped.` : `All ${preview.excluded.length} purchase orders were skipped${primarySkipReason ? ` because ${primarySkipReason[0].toLowerCase()}` : '.'}`}
                    </p>
                    {preview.errors.length > 0 && (
                      <ul className="mt-1 list-disc pl-4 text-xs text-[var(--erp-negative)]">
                        {preview.errors.slice(0, 3).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3 border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)] px-3 py-2.5">
              <p className="text-xs text-[var(--erp-muted)]">
                Detected format: <span className="font-semibold text-[var(--erp-text)]">{preview.format_name}</span>
              </p>
              <label className="flex items-center gap-2 text-xs text-[var(--erp-muted)]">
                <span>Override format</span>
                <select
                  value={formatId}
                  disabled={busy}
                  onChange={e => void overrideFormat(e.target.value)}
                  className="px-2 py-1.5 bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)]"
                >
                  {preview.allowed_formats.map(format => (
                    <option key={format.id} value={format.id}>{format.name}</option>
                  ))}
                </select>
              </label>
            </div>
            {preview.warnings.length > 0 ? (
              <div className="border border-[rgba(201,162,78,0.4)] bg-[rgba(201,162,78,0.07)] px-3 py-2.5">
                <p className="text-xs font-semibold text-[var(--erp-gold)]">Warnings</p>
                <ul className="mt-1 space-y-1 text-xs text-[var(--erp-text)]">
                {preview.warnings.map(item => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              </div>
            ) : null}

            <section>
              <h4 className="text-[11px] font-mono uppercase tracking-wider text-[var(--erp-gold)] border-b border-[var(--erp-hairline)] pb-1 mb-3">
                Will Import ({preview.importable.length})
              </h4>
              {preview.importable.length === 0 ? (
                <p className="text-sm text-[var(--erp-muted)]">No purchase orders can be imported for this branch and file.</p>
              ) : (
                <div className="overflow-x-auto border border-[var(--erp-hairline)]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[var(--erp-surface-2)] font-mono text-[10px] uppercase tracking-wider text-[var(--erp-muted)]">
                      <tr>
                        <th className="px-3 py-2 w-8" />
                        <th className="px-3 py-2">Order No</th>
                        <th className="px-3 py-2">Party</th>
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
                                      <th className="text-right py-1 w-24">Rate</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {row.lines.map((line, index) => (
                                      <tr key={`${row.order_no}-${index}`}>
                                        <td className="py-0.5 font-mono">{line.description}</td>
                                        <td className="py-0.5 text-right font-mono">{num(line.quantity).toFixed(2)}</td>
                                        <td className="py-0.5 text-right font-mono">{line.rate == null ? '—' : num(line.rate).toFixed(2)}</td>
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

            {preview.unmatched_parties.length > 0 && (
              <section className="border border-[rgba(217,99,90,0.45)] bg-[rgba(217,99,90,0.06)] p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold text-[var(--erp-negative)]">
                    Needs a decision ({preview.unmatched_parties.length} parties)
                  </h4>
                  {userRole === 'admin' && (
                    <div className="flex items-center gap-3">
                    <button type="button" className="text-xs text-[var(--erp-gold)] underline" onClick={() => {
                      setDecisions(prev => {
                        const next = { ...prev };
                        preview.unmatched_parties.forEach(party => {
                          if (next[party.code]?.action === 'create') {
                            next[party.code] = {
                              ...next[party.code],
                              branch_ids: newPartyBranches,
                              primary_branch_id: Number(entityId),
                            };
                          }
                        });
                        return next;
                      });
                    }}>Apply Branch selection to all new parties</button>
                    <button type="button" className="text-xs text-[var(--erp-gold)] underline" onClick={() => {
                      const next = { ...decisions };
                      preview.unmatched_parties.forEach(party => { if (!next[party.code]) next[party.code] = { action: 'skip' }; });
                      setDecisions(next);
                    }}>Skip all undecided</button>
                    </div>
                  )}
                </div>
                {userRole !== 'admin' && <p className="text-sm text-[var(--erp-muted)]">Ask an admin to add this party</p>}
                {preview.unmatched_parties.map(party => {
                  const decision = decisions[party.code];
                  const selected = decision?.action || '';
                  const suggested = party.suggested_matches[0];
                  return (
                    <div key={party.code} className="border border-[var(--erp-hairline)] bg-[var(--erp-surface)] p-3 space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{party.name || 'Unnamed Party'} <span className="font-mono text-xs text-[var(--erp-muted)]">({party.code})</span></p>
                          <p className="text-xs text-[var(--erp-muted)]">{party.city || '—'} · {party.po_count} POs · {party.line_count} lines</p>
                          <p className="text-xs font-mono text-[var(--erp-muted)]">Orders: {party.order_nos.join(', ')}</p>
                        </div>
                      </div>
                      {userRole === 'admin' && (
                        <>
                          <div className="flex flex-wrap gap-2">
                            {(['link', 'create', 'map', 'skip'] as const).map(action => {
                              const hasExisting = party.exists_in_branches.length > 0;
                              const disabled = action === 'create' && hasExisting;
                              return <button key={action} type="button" disabled={disabled} onClick={() => !disabled && setDecision(party.code, { action, ...(action === 'create' ? { code: party.code, name: party.name, branch_ids: newPartyBranches.length ? newPartyBranches : [Number(entityId)], primary_branch_id: Number(entityId) } : {}) })} className={`px-3 py-1.5 text-xs border ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${selected === action ? 'border-[var(--erp-gold)] text-[var(--erp-gold)] bg-[var(--erp-surface-2)]' : 'border-[var(--erp-hairline)]'}`}>
                                {action === 'link' ? `Link ${party.existing_party_name || party.name} to ${selectedEntity?.short_code || 'Branch'}` : action === 'create' ? 'Add as new party' : action === 'map' ? 'Map to existing party' : 'Skip POs'}
                              </button>
                            })}
                          </div>
                          {party.exists_in_branches.length > 0 && <p className="text-xs text-[var(--erp-negative)]">A party with this code already exists in {party.exists_in_branches.map(branch => branch.name).join(', ')}</p>}
                          {selected === 'create' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <input required value={String(decision.code || party.code)} onChange={e => setDecision(party.code, { ...decision, code: e.target.value })} placeholder="Party code *" className="px-2 py-1.5 text-xs border border-[var(--erp-hairline)] bg-[var(--erp-surface)]" />
                              <input required value={String(decision.name || party.name)} onChange={e => setDecision(party.code, { ...decision, name: e.target.value })} placeholder="Party name *" className="px-2 py-1.5 text-xs border border-[var(--erp-hairline)] bg-[var(--erp-surface)]" />
                              <div className="sm:col-span-2 space-y-2">
                                <p className="text-xs font-semibold text-[var(--erp-text)]">Branches *</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {entities.map(branch => {
                                    const branchIds = (decision.branch_ids as number[] | undefined) || [Number(entityId)];
                                    const checked = branchIds.includes(branch.id);
                                    const locked = branch.id === Number(entityId);
                                    return (
                                      <label key={branch.id} className="flex items-center gap-2 text-xs text-[var(--erp-muted)]">
                                        <input type="checkbox" checked={checked} disabled={locked} onChange={event => updatePartyBranches(party.code, event.target.checked ? [...branchIds, branch.id] : branchIds.filter(id => id !== branch.id))} />
                                        <span>{branch.short_code} · {branch.entity_name}</span>
                                        <input type="radio" name={`primary-${party.code}`} checked={Number(decision.primary_branch_id) === branch.id} onChange={() => updatePartyBranches(party.code, branchIds, branch.id)} />
                                        <span>Primary</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          )}
                          {selected === 'map' && (
                            <select value={String(decision.map_to_party_id || '')} onChange={e => setDecision(party.code, { ...decision, map_to_party_id: Number(e.target.value) })} className="w-full px-2 py-1.5 text-xs border border-[var(--erp-hairline)] bg-[var(--erp-surface)]">
                              <option value="">Select existing Party *</option>
                              {party.suggested_matches.map(match => <option key={`suggested-${match.id}`} value={match.id}>{match.name} ({match.code}) — {match.why}</option>)}
                              {partyOptions.filter(option => !party.suggested_matches.some(match => match.id === option.id)).map(option => <option key={option.id} value={option.id}>{option.customer_name} ({option.customer_code}) — {option.city}</option>)}
                            </select>
                          )}
                          {suggested && selected === 'create' && !party.exists_in_branches.length && <p className="text-xs text-[var(--erp-gold)]">Similar party exists: {suggested.name} ({suggested.code}). Did you mean to map?</p>}
                        </>
                      )}
                    </div>
                  );
                })}
              </section>
            )}

            {preview.excluded.length > 0 ? (
            <section className="border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)]">
              <button type="button" onClick={() => setSkippedOpen(open => !open)} aria-expanded={skippedOpen} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left focus:outline-none focus:ring-2 focus:ring-[var(--erp-gold)]">
                <span className="flex items-center gap-2 text-xs font-semibold text-[var(--erp-negative)]">
                  <AlertTriangle className="h-3.5 w-3.5" /> View all skipped orders ({preview.excluded.length})
                </span>
                {skippedOpen ? <ChevronDown className="h-4 w-4 text-[var(--erp-muted)]" /> : <ChevronRight className="h-4 w-4 text-[var(--erp-muted)]" />}
              </button>
              {skippedOpen ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-[var(--erp-surface-2)] font-mono text-[10px] uppercase tracking-wider text-[var(--erp-muted)]">
                    <tr>
                      <th className="px-2 py-2">Order No</th>
                      <th className="px-2 py-2">Party</th>
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
              ) : null}
            </section>
            ) : null}

            </div>
            <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-[var(--erp-hairline)] bg-[var(--erp-surface)] pt-3">
              <button type="button" onClick={onClose} className="px-4 py-2 border border-[var(--erp-hairline)] text-xs font-mono">Cancel</button>
              <button
                type="button"
                disabled={busy || !preview.importable.length || preview.unmatched_parties.some(party => !decisions[party.code])}
                onClick={() => void confirmImport()}
                className="px-5 py-2 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold disabled:opacity-40"
              >
                {busy
                  ? 'Importing…'
                  : 'Confirm Import'}
              </button>
            </div>
            {!preview.importable.length ? <p className="text-right text-[11px] text-[var(--erp-muted)]">No valid purchase orders to import.</p> : null}
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
    const blob = new Blob([`Order No\tParty Code\tReason\n${text}`], { type: 'text/plain' });
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
