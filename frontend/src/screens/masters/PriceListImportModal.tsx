import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, ChevronDown, ChevronRight, Upload, X } from 'lucide-react';
import { FileDropZone } from '../../components/common/FileDropZone';
import { useErp } from '../../context/ErpContext';
import { entitiesApi } from '../../services/entitiesApi';
import { BrandRow } from '../../services/brandsApi';
import { notifyApiError, notifySuccess } from '../../services/notify';
import { acquireSaveLock, releaseSaveLock } from '../../services/saveLock';
import { num } from '../../services/mastersApi';
import { OsmPdfPreview, PriceListImportPreview, QualityPricePreview, priceListsApi } from '../../services/priceListsApi';

type Step = 'setup' | 'preview';

export const PriceListImportModal: React.FC<{ onClose: () => void; onImported: () => void }> = ({ onClose, onImported }) => {
  const { selectedEntityId } = useErp();
  const [step, setStep] = useState<Step>('setup');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PriceListImportPreview | null>(null);
  const [qualityPreview, setQualityPreview] = useState<QualityPricePreview | null>(null);
  const [osmPreview, setOsmPreview] = useState<OsmPdfPreview | null>(null);
  const [formatId, setFormatId] = useState('');
  const [confirmedWarnings, setConfirmedWarnings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState('');
  const [selectionError, setSelectionError] = useState('');
  const [year, setYear] = useState<number | ''>('');
  const [season, setSeason] = useState<'Summer' | 'Winter' | ''>('');
  const [availableBrands, setAvailableBrands] = useState<BrandRow[]>([]);
  const [brandId, setBrandId] = useState<number | ''>('');
  const [brandLoading, setBrandLoading] = useState(false);
  const [brandError, setBrandError] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const savingLock = useMemo(() => ({ current: false }), []);
  const currentYear = new Date().getFullYear();
  const seasonRange = season === 'Summer' ? `1 Jan ${year} to 30 Jun ${year}` : season === 'Winter' ? `1 Jul ${year} to 31 Dec ${year}` : '';
  const seasonLabel = year && season ? `${season} ${year}` : '';
  const branchId = typeof selectedEntityId === 'number' ? selectedEntityId : 0;
  const selectedBrand = availableBrands.find(brand => brand.id === brandId);
  const hasOsmPdf = ['OCM', 'OSM'].includes((selectedBrand?.brand_code || '').toUpperCase()) || (selectedBrand?.brand_name || '').toUpperCase().includes('OSM');
  useEffect(() => {
    setFormatId(hasOsmPdf ? 'osm_pdf_pricelist' : '');
  }, [hasOsmPdf]);

  useEffect(() => {
    let current = true;
    setAvailableBrands([]);
    setBrandId('');
    setBrandError('');
    setPreview(null);
    setQualityPreview(null);
    setOsmPreview(null);
    setStep('setup');
    if (!branchId) {
      setBrandError('Select a Branch in the header before importing.');
      return () => { current = false; };
    }
    setBrandLoading(true);
    void entitiesApi.retrieve(branchId)
      .then(entity => {
        if (!current) return;
        const mapped = (entity.brands || []).map(brand => ({
          id: brand.id,
          brand_code: brand.brand_code,
          brand_name: brand.brand_name,
          status: 'Active' as const,
        })) as BrandRow[];
        setAvailableBrands(mapped);
        const osmBrand = mapped.find(brand => ['OCM', 'OSM'].includes(brand.brand_code.toUpperCase()) || brand.brand_name.toUpperCase().includes('OSM'));
        setBrandId(osmBrand ? osmBrand.id : mapped.length === 1 ? mapped[0].id : '');
        if (!mapped.length) setBrandError('No active Brands are mapped to this Branch.');
      })
      .catch(() => {
        if (current) setBrandError('Could not load Brands for this Branch.');
      })
      .finally(() => {
        if (current) setBrandLoading(false);
      });
    return () => { current = false; };
  }, [branchId]);

  const runPreview = async () => {
    if (!branchId) { setBrandError('Select a Branch in the header before importing.'); return; }
    if (!selectedBrand) { setBrandError(availableBrands.length > 1 ? 'Select a Brand.' : 'No active Brands are mapped to this Branch.'); return; }
    if (!year || !season) { setSelectionError('Select a Year and Season.'); return; }
    if (!file) { setFileError(hasOsmPdf ? 'Select a PDF file.' : 'Select an Excel file.'); return; }
    setBusy(true); setFileError('');
    setSelectionError('');
    const requestBranchId = branchId;
    try {
      const nextPreview = await priceListsApi.importPreview(file, year, season, requestBranchId, selectedBrand.id, formatId || undefined);
      if (requestBranchId !== (typeof selectedEntityId === 'number' ? selectedEntityId : 0)) return;
      if (formatId === 'osm_pdf_pricelist') {
        setOsmPreview(nextPreview as OsmPdfPreview);
        setPreview(null);
        setQualityPreview(null);
      } else if (formatId) {
        setQualityPreview(nextPreview as QualityPricePreview);
        setPreview(null);
        setOsmPreview(null);
      } else {
        setPreview(nextPreview as PriceListImportPreview);
        setQualityPreview(null);
        setOsmPreview(null);
      }
      setConfirmedWarnings(false); setExpanded({}); setStep('preview');
    }
    catch (error) { notifyApiError(error, 'Could not preview the import file.'); }
    finally { setBusy(false); }
  };

  const confirmQualityImport = async () => {
    if (!qualityPreview || !acquireSaveLock(savingLock)) return;
    setBusy(true);
    try {
      const result = await priceListsApi.importCommit(qualityPreview.preview_token, [], qualityPreview.year, qualityPreview.season, branchId, selectedBrand?.id || 0, 'ocm_regular_pricelist', confirmedWarnings);
      notifySuccess(`${result.rows_imported || qualityPreview.entries.length} ${qualityPreview.title} quality rows imported as Active.`);
      onImported();
    } catch (error) { notifyApiError(error, 'Quality import was not committed.'); }
    finally { setBusy(false); releaseSaveLock(savingLock); }
  };


  const confirmOsmImport = async () => {
    if (!osmPreview || !acquireSaveLock(savingLock)) return;
    setBusy(true);
    try {
      const result = await priceListsApi.importCommit(osmPreview.preview_token, [], osmPreview.year, osmPreview.season, branchId, selectedBrand?.id || 0, 'osm_pdf_pricelist');
      notifySuccess(`${result.products_created ?? 0} products added and ${result.products_updated ?? 0} updated in the product master.`);
      onImported();
    } catch (error) { notifyApiError(error, 'The PDF was not imported.'); }
    finally { setBusy(false); releaseSaveLock(savingLock); }
  };

  const confirmImport = async () => {
    if (!preview?.importable.length || !acquireSaveLock(savingLock)) return;
    setBusy(true);
    try {
      const result = await priceListsApi.importCommit(preview.preview_token, preview.importable.map(group => group.import_key), preview.year, preview.season, branchId, selectedBrand?.id || 0);
      notifySuccess(`${result.created_count} ${preview.season_label} Price Lists imported as Draft. Review and activate from the Price Lists screen.`);
      onImported();
    } catch (error) { notifyApiError(error, 'Import was not committed.'); }
    finally { setBusy(false); releaseSaveLock(savingLock); }
  };

  const entryCount = preview?.importable.reduce((count, group) => count + group.entries.length, 0) || 0;

  return <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3 sm:p-4"><div role="dialog" aria-modal="true" aria-labelledby="price-list-import-title" className="w-full max-w-3xl max-h-[85vh] overflow-y-auto bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] rounded-md shadow-2xl p-4 sm:p-5 space-y-4">
    <div className="flex justify-between items-start border-b border-[var(--erp-hairline)] pb-2 sticky top-0 bg-[var(--erp-surface)] z-10"><div><h3 id="price-list-import-title" className="font-display text-lg font-bold flex items-center gap-2"><Upload className="w-4 h-4 text-[var(--erp-gold)]" /> Import Price List</h3><p className="text-[11px] font-mono text-[var(--erp-muted)] mt-0.5">{step === 'setup' ? 'Step 1 of 2 · Select period and upload' : 'Step 2 of 2 · Review before import'}</p><p className="mt-1 max-w-xl text-xs text-[var(--erp-muted)]">W/S and Retail are for reference only. Orders use Ex-mill.</p></div><button type="button" title="Close" aria-label="Close import price list" onClick={onClose} className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-text)] focus:outline-none focus:ring-2 focus:ring-[var(--erp-gold)]"><X className="w-4 h-4" /></button></div>
    {step === 'setup' ? <div className="space-y-4"><div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-3 items-start"><div className="space-y-1"><label htmlFor="price-list-import-year" className="block text-[11px] font-mono uppercase tracking-wider">Year <span className="text-[var(--erp-negative)]">*</span></label><select id="price-list-import-year" value={year} onChange={event => { setYear(event.target.value ? Number(event.target.value) : ''); setSelectionError(''); }} className="w-full border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)] px-2.5 py-1.5 text-sm focus:outline-none focus:border-[var(--erp-gold)]"><option value="">Select year</option>{[currentYear - 1, currentYear, currentYear + 1].map(option => <option key={option} value={option}>{option}</option>)}</select></div><div className="space-y-1"><p className="text-[11px] font-mono uppercase tracking-wider">Season <span className="text-[var(--erp-negative)]">*</span></p><div className="grid grid-cols-2 gap-2">{(['Summer', 'Winter'] as const).map(option => <button key={option} type="button" aria-pressed={season === option} onClick={() => { setSeason(option); setSelectionError(''); }} className={`text-left border px-3 py-2 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--erp-gold)] ${season === option ? 'border-[var(--erp-gold)] bg-[rgba(201,162,78,0.1)]' : 'border-[var(--erp-hairline)] hover:border-[var(--erp-gold)]'}`}><span className="block text-sm font-semibold">{option}</span><span className="text-[11px] text-[var(--erp-muted)]">{hasOsmPdf ? 'w.e.f. date is read from the PDF' : option === 'Summer' ? `1 Jan – 30 Jun ${year || ''}` : `1 Jul – 31 Dec ${year || ''}`}</span></button>)}</div></div></div>{availableBrands.length > 1 ? <div className="space-y-1"><label htmlFor="price-list-import-brand" className="block text-[11px] font-mono uppercase tracking-wider">Brand <span className="text-[var(--erp-negative)]">*</span></label><select id="price-list-import-brand" value={brandId} onChange={event => { setBrandId(event.target.value ? Number(event.target.value) : ''); setBrandError(''); setFile(null); setFileError(''); }} disabled={brandLoading} className="w-full border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)] px-2.5 py-1.5 text-sm focus:outline-none focus:border-[var(--erp-gold)]"><option value="">{brandLoading ? 'Loading Brands…' : 'Select Brand'}</option>{availableBrands.map(brand => <option key={brand.id} value={brand.id}>{brand.brand_name} ({brand.brand_code})</option>)}</select></div> : null}{hasOsmPdf ? <p className="text-[11px] text-[var(--erp-muted)] border-l-2 border-[var(--erp-gold)] pl-2">OSM price lists are PDF only. Every quality is stored on the selected brand and shown in the product master. The w.e.f. date in the PDF is used, and the list stays open-ended.</p> : null}{brandLoading ? <p className="text-[11px] text-[var(--erp-muted)]">Loading Brands for the selected Branch…</p> : null}{brandError ? <p className="text-xs text-[var(--erp-negative)]" role="alert">{brandError}</p> : null}{selectionError ? <p className="text-xs text-[var(--erp-negative)]" role="alert">{selectionError}</p> : null}{seasonLabel ? <p className="flex items-center gap-1.5 text-[11px] font-mono text-[var(--erp-muted)] border-l-2 border-[var(--erp-gold)] pl-2"><CalendarDays className="w-3.5 h-3.5 text-[var(--erp-gold)]" /> Selected period: <span className="text-[var(--erp-text)]">{seasonLabel}</span>{hasOsmPdf ? ' · date comes from the PDF' : ` · ${seasonRange}`}</p> : null}<FileDropZone id="price-list-import-file" label={hasOsmPdf ? 'OSM price-list PDF' : 'Source Excel file'} required compact emptyTitle={hasOsmPdf ? 'Drop the OSM price-list PDF here' : 'Drop your Excel file here'} emptyHint={hasOsmPdf ? 'PDF only, max 8 MB' : 'Browse files · .xlsx only, max 5 MB'} error={fileError} helper={hasOsmPdf ? 'Prices stay exactly as printed. A dash is stored as no price.' : 'Records are matched by Brand and Product code. Unmatched rows are skipped.'} accept={hasOsmPdf ? '.pdf,application/pdf' : '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'} rejectionMessage={hasOsmPdf ? 'Only a PDF can be uploaded for OSM.' : 'Donear uses Excel. Choose OSM India Limited in Brand to upload the price-list PDF.'} file={file} onChange={next => { const limit = hasOsmPdf ? 8 * 1024 * 1024 : 5 * 1024 * 1024; if (next && next.size > limit) { setFile(null); setFileError(hasOsmPdf ? 'The PDF must be no larger than 8 MB.' : 'The price list must be no larger than 5 MB.'); } else { setFile(next); setFileError(''); } }} onFileRejected={message => setFileError(message)} /><div className="flex justify-end gap-2 pt-2 border-t border-[var(--erp-hairline)]"><button type="button" onClick={onClose} className="px-3 py-1.5 border border-[var(--erp-hairline)] text-xs font-mono hover:bg-[var(--erp-surface-2)] focus:outline-none focus:ring-2 focus:ring-[var(--erp-gold)]">Cancel</button><button type="button" disabled={busy || brandLoading || !branchId || !selectedBrand || !year || !season || !file} onClick={() => void runPreview()} className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-[var(--erp-gold)]">{busy ? 'Preparing…' : 'Preview Import'}</button></div></div> : null}
    {step === 'preview' && osmPreview ? <div className="space-y-4"><p className="text-[11px] font-mono text-[var(--erp-muted)] border-l-2 border-[var(--erp-gold)] pl-2">Detected <span className="text-[var(--erp-text)]">{osmPreview.title}</span> · w.e.f. {osmPreview.valid_from} · open-ended · {osmPreview.unit_text}</p><p className="text-xs whitespace-pre-wrap">{osmPreview.tax_note}</p>{osmPreview.packing_note ? <p className="text-xs whitespace-pre-wrap">{osmPreview.packing_note}</p> : null}<div className="max-h-80 overflow-auto border border-[var(--erp-hairline)]"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-[var(--erp-surface-2)] font-mono text-[10px] uppercase text-[var(--erp-muted)]"><tr><th className="px-2 py-2">Sr</th><th className="px-2 py-2">Collection</th><th className="px-2 py-2">Quality No.</th><th className="px-2 py-2">Shades</th><th className="px-2 py-2">Delivery</th><th className="px-2 py-2 text-right">Ex-Mill</th><th className="px-2 py-2 text-right">W/S</th><th className="px-2 py-2 text-right">Retail</th><th className="px-2 py-2">Discount</th></tr></thead><tbody>{osmPreview.entries.map(entry => <tr key={entry.quality_code} className="border-t border-[var(--erp-hairline)]"><td className="px-2 py-2 font-mono">{entry.sr_no}</td><td className="px-2 py-2">{entry.collection_name ? `${entry.collection_name}${entry.collection_code ? ` (${entry.collection_code})` : ''}` : '-'}</td><td className="px-2 py-2 font-mono">{entry.quality_code}</td><td className="px-2 py-2 max-w-[220px] truncate" title={entry.shades_raw || ''}>{entry.shades_raw || '-'}</td><td className="px-2 py-2">{entry.delivery_raw || '-'}</td><td className="px-2 py-2 text-right font-mono">{entry.ex_mill ?? '-'}</td><td className="px-2 py-2 text-right font-mono">{entry.wholesale ?? '-'}</td><td className="px-2 py-2 text-right font-mono">{entry.retail ?? '-'}</td><td className="px-2 py-2">{entry.discount_note || '-'}</td></tr>)}</tbody></table></div><div className="flex justify-end gap-2 pt-2 border-t border-[var(--erp-hairline)]"><button type="button" onClick={onClose} className="px-3 py-1.5 border border-[var(--erp-hairline)] text-xs font-mono">Cancel</button><button type="button" disabled={busy} onClick={() => void confirmOsmImport()} className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold disabled:opacity-40">{busy ? 'Importing...' : `Import ${osmPreview.row_count} qualities`}</button></div></div> : null}
    {step === 'preview' && qualityPreview ? <div className="space-y-4"><p className="text-[11px] font-mono text-[var(--erp-muted)] border-l-2 border-[var(--erp-gold)] pl-2">Detected <span className="text-[var(--erp-text)]">{qualityPreview.title}</span> · {qualityPreview.valid_from} to {qualityPreview.valid_to} · unit: {qualityPreview.unit_text || 'not stated'}</p><div className="grid grid-cols-3 gap-2 text-center text-xs"><div className="border border-[var(--erp-hairline)] p-2"><strong>{qualityPreview.entries.length}</strong><span className="block text-[var(--erp-muted)]">Rows</span></div><div className="border border-[var(--erp-hairline)] p-2"><strong>{qualityPreview.flagged_counts.warning}</strong><span className="block text-[var(--erp-muted)]">Warnings</span></div><div className="border border-[var(--erp-hairline)] p-2"><strong className="text-[var(--erp-negative)]">{qualityPreview.flagged_counts.error}</strong><span className="block text-[var(--erp-muted)]">Errors</span></div></div>{qualityPreview.warnings.length ? <section className="border border-[rgba(201,162,78,0.45)] bg-[rgba(201,162,78,0.08)] p-2.5 text-xs">{qualityPreview.warnings.map(warning => <p key={warning.code}>{warning.code}: {warning.message}</p>)}</section> : null}<label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={confirmedWarnings} onChange={event => setConfirmedWarnings(event.target.checked)} /> I have reviewed the warnings.</label><div className="max-h-80 overflow-auto border border-[var(--erp-hairline)]"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-[var(--erp-surface-2)] font-mono text-[10px] uppercase text-[var(--erp-muted)]"><tr><th className="px-2 py-2">Collection</th><th className="px-2 py-2">Quality No.</th><th className="px-2 py-2">Shades</th><th className="px-2 py-2">Delivery</th><th className="px-2 py-2 text-right">Ex-Mill</th><th className="px-2 py-2">Flags</th></tr></thead><tbody>{qualityPreview.entries.map(entry => <tr key={`${entry.source_row}-${entry.quality_no}`} className="border-t border-[var(--erp-hairline)]"><td className="px-2 py-2">{entry.collection_name}</td><td className="px-2 py-2 font-mono">{entry.quality_no}</td><td className="px-2 py-2">{entry.shade_tokens.join(', ')}</td><td className="px-2 py-2">{entry.delivery_raw || '-'}</td><td className="px-2 py-2 text-right">{entry.ex_mill || '-'}</td><td className="px-2 py-2">{entry.flags.length ? entry.flags.map(flag =>     <span title={flag.message} key={`${flag.code}-${flag.message}`} className={`mr-1 inline-block ${flag.severity === 'error' ? 'text-[var(--erp-negative)]' : 'text-[var(--erp-gold)]'}`}>●</span>) : '-'}</td></tr>)}</tbody></table></div><div className="flex justify-end gap-2 pt-2 border-t border-[var(--erp-hairline)]"><button type="button" onClick={onClose} className="px-3 py-1.5 border border-[var(--erp-hairline)] text-xs font-mono">Cancel</button><button type="button" disabled={busy || qualityPreview.flagged_counts.error > 0 || (qualityPreview.flagged_counts.warning > 0 && !confirmedWarnings)} onClick={() => void confirmQualityImport()} className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold disabled:opacity-40">{busy ? 'Importing…' : 'Import quality prices as Draft'}</button></div></div> : null}
    {step === 'preview' && preview ? <div className="space-y-4"><p className="text-[11px] font-mono text-[var(--erp-muted)] border-l-2 border-[var(--erp-gold)] pl-2">Importing <span className="text-[var(--erp-text)]">{preview.season_label}</span> · {preview.valid_from} to {preview.valid_to}</p>{preview.warnings.length ? <section className="border border-[rgba(201,162,78,0.45)] bg-[rgba(201,162,78,0.08)] p-2.5 text-xs"><p className="font-mono uppercase tracking-wider text-[var(--erp-gold)] mb-1">Warnings</p>{preview.warnings.map(warning => <p key={warning}>{warning}</p>)}</section> : null}
      <section><h4 className="text-[11px] font-mono uppercase tracking-wider text-[var(--erp-gold)] border-b border-[var(--erp-hairline)] pb-1 mb-3">Will Import ({preview.importable.length} price lists, {entryCount} entries)</h4>{preview.importable.length ? <div className="overflow-x-auto border border-[var(--erp-hairline)]"><table className="w-full text-left text-xs"><thead className="bg-[var(--erp-surface-2)] font-mono text-[10px] uppercase text-[var(--erp-muted)]"><tr><th className="px-3 py-2 w-8" /><th className="px-3 py-2">Brand</th><th className="px-3 py-2">Season</th><th className="px-3 py-2">Valid From - To</th><th className="px-3 py-2 text-right">Entries</th></tr></thead><tbody>{preview.importable.map(group => <React.Fragment key={group.import_key}><tr className="border-t border-[var(--erp-hairline)]"><td className="px-3 py-2"><button type="button" aria-label={`Toggle ${group.season_label}`} onClick={() => setExpanded(prev => ({ ...prev, [group.import_key]: !prev[group.import_key] }))}>{expanded[group.import_key] ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}</button></td><td className="px-3 py-2">{group.brand_name} <span className="font-mono text-[var(--erp-muted)]">({group.brand_code})</span></td><td className="px-3 py-2 font-medium">{group.season_label}</td><td className="px-3 py-2 font-mono">{group.valid_from} → {group.valid_to}</td><td className="px-3 py-2 text-right font-mono">{group.entries.length}</td></tr>{expanded[group.import_key] ? <tr className="bg-[var(--erp-surface-2)]"><td /><td colSpan={4} className="px-3 py-2"><table className="w-full"><thead><tr className="font-mono text-[10px] uppercase text-[var(--erp-muted)]"><th className="text-left py-1">Product</th><th className="text-right py-1">Length</th><th className="text-left py-1">Basis</th><th className="text-right py-1">Price</th><th className="text-right py-1">Per Meter</th><th className="text-right py-1">Per Taka</th><th className="text-right py-1">Taka Qty</th></tr></thead><tbody>{group.entries.map(entry => <tr key={`${group.import_key}-${entry.source_row}`}><td className="py-1">{entry.product_name} <span className="font-mono text-[var(--erp-muted)]">({entry.product_code})</span></td><td className="py-1 text-right font-mono">{num(entry.taka_length_meters).toFixed(3)}</td><td className="py-1">{entry.price_basis}</td><td className="py-1 text-right font-mono">₹{num(entry.price_value).toFixed(2)}</td><td className="py-1 text-right font-mono">₹{num(entry.price_per_meter).toFixed(2)}</td><td className="py-1 text-right font-mono">₹{num(entry.price_per_taka).toFixed(2)}</td><td className="py-1 text-right font-mono">{entry.taka_quantity ?? '-'}</td></tr>)}</tbody></table></td></tr> : null}</React.Fragment>)}</tbody></table></div> : <p className="text-sm text-[var(--erp-muted)]">No price lists can be imported.</p>}</section>
      {preview.excluded.length ? <section className="border border-[rgba(217,99,90,0.45)] bg-[rgba(217,99,90,0.08)] p-3"><h4 className="text-[11px] font-mono uppercase tracking-wider text-[var(--erp-negative)] border-b border-[rgba(217,99,90,0.35)] pb-1 mb-3 flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5" /> Will NOT Import ({preview.excluded.length})</h4><table className="w-full text-left text-xs"><thead className="font-mono text-[10px] uppercase text-[var(--erp-negative)]"><tr><th className="px-2 py-2">Row</th><th className="px-2 py-2">Brand</th><th className="px-2 py-2">Product</th><th className="px-2 py-2">Reason</th></tr></thead><tbody>{preview.excluded.map(row => <tr key={`${row.source_row}-${row.product_code}`} className="border-t border-[rgba(217,99,90,0.25)]"><td className="px-2 py-2 font-mono">{row.source_row}</td><td className="px-2 py-2">{row.brand_code}</td><td className="px-2 py-2 font-mono">{row.product_code}</td><td className="px-2 py-2 text-[var(--erp-negative)]">{row.reason}</td></tr>)}</tbody></table></section> : null}
      <div className="flex justify-end gap-2 pt-2 border-t border-[var(--erp-hairline)]"><button type="button" onClick={onClose} className="px-3 py-1.5 border border-[var(--erp-hairline)] text-xs font-mono">Cancel</button><button type="button" disabled={busy || !preview.importable.length} onClick={() => void confirmImport()} className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold disabled:opacity-40">{busy ? 'Importing...' : `Confirm ${preview.season_label} (${preview.importable.length} lists, ${entryCount} entries)`}</button></div>
    </div> : null}
  </div></div>;
};
