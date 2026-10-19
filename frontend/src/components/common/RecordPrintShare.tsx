import React, { useState } from 'react';
import { Check, Copy, MessageCircle, Printer, Share2, X } from 'lucide-react';
import { notifyError, notifySuccess } from '../../services/notify';

export interface RecordDetailField {
  label: string;
  value: string | number | null | undefined;
}

function printableFields(fields: RecordDetailField[]): RecordDetailField[] {
  return fields.filter(field => field.value !== null && field.value !== undefined && String(field.value).trim() !== '');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character] || character));
}

export function formatRecordSummary(title: string, fields: RecordDetailField[]): string {
  return [title, '', ...printableFields(fields).map(field => `${field.label}: ${field.value}`)].join('\n');
}

export function recordWhatsAppUrl(title: string, fields: RecordDetailField[]): string {
  return `https://wa.me/?text=${encodeURIComponent(formatRecordSummary(title, fields))}`;
}

function printHtml(title: string, fields: RecordDetailField[]): string {
  const rows = printableFields(fields).map(field => (
    `<div class="field"><div class="label">${escapeHtml(field.label)}</div><div class="value">${escapeHtml(String(field.value))}</div></div>`
  )).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #1b2430; font-family: Arial, sans-serif; font-size: 12px; }
    header { border-bottom: 2px solid #b68d37; padding-bottom: 12px; margin-bottom: 20px; }
    h1 { margin: 0 0 6px; font-size: 24px; font-weight: 700; }
    .date { color: #646e7e; font-size: 11px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px 28px; }
    .field { min-width: 0; page-break-inside: avoid; }
    .label { color: #646e7e; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 4px; }
    .value { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.45; }
    @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  </style></head><body><header><h1>${escapeHtml(title)}</h1><div class="date">Printed ${escapeHtml(new Date().toLocaleDateString())}</div></header><main class="grid">${rows}</main></body></html>`;
}

export function printRecordDetails(title: string, fields: RecordDetailField[]): void {
  // Keep popup creation and document generation in the original click event.
  let printWindow: Window | null = null;
  try {
    printWindow = window.open('', '_blank', 'width=900,height=700');
  } catch {
    notifyError('Could not open the print window.');
    return;
  }
  if (!printWindow) {
    notifyError('The print window was blocked by the browser.');
    return;
  }
  let printed = false;
  const print = () => {
    if (printed) return;
    printed = true;
    try {
      printWindow?.focus();
      printWindow?.print();
      window.setTimeout(() => printWindow?.close(), 1000);
    } catch {
      printWindow?.close();
      notifyError('Could not start printing this record.');
    }
  };
  try {
    printWindow.onload = print;
    printWindow.document.open();
    printWindow.document.write(printHtml(title, fields));
    printWindow.document.close();
    if (printWindow.document.readyState === 'complete') {
      window.setTimeout(print, 0);
    }
  } catch {
    printWindow.close();
    notifyError('Could not prepare this record for printing.');
  }
}

interface RecordPrintShareProps {
  title: string;
  recordName: string;
  fields: RecordDetailField[];
  shareFields?: RecordDetailField[];
}

export const RecordPrintShare: React.FC<RecordPrintShareProps> = ({ title, recordName, fields, shareFields = fields }) => {
  const [shareOpen, setShareOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const whatsappUrl = recordWhatsAppUrl(title, shareFields);

  const copyDetails = async () => {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(formatRecordSummary(title, shareFields));
      notifySuccess(`${title} copied to clipboard.`);
      setShareOpen(false);
    } catch {
      notifyError('Could not copy the record details.');
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="relative flex items-center gap-2 no-print">
      <button type="button" aria-label={`Print ${title}`} onClick={() => printRecordDetails(title, fields)} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[var(--erp-hairline-strong)] text-xs text-[var(--erp-text)] hover:border-[var(--erp-gold)] hover:text-[var(--erp-gold)]">
        <Printer className="w-3.5 h-3.5" /> Print
      </button>
      <button type="button" aria-label={`Share ${title}`} onClick={() => setShareOpen(open => !open)} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[var(--erp-hairline-strong)] text-xs text-[var(--erp-text)] hover:border-[var(--erp-gold)] hover:text-[var(--erp-gold)]">
        <Share2 className="w-3.5 h-3.5" /> Share
      </button>
      {shareOpen && (
        <div role="dialog" aria-label={`Share ${title}`} className="absolute right-0 top-full z-20 mt-2 w-72 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-4 shadow-xl">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h4 className="font-display font-bold text-sm">Share {recordName}</h4>
              <p className="text-[11px] text-[var(--erp-muted)] mt-1">Only this record will be shared.</p>
            </div>
            <button type="button" aria-label="Close share options" onClick={() => setShareOpen(false)}><X className="w-4 h-4" /></button>
          </div>
          <div className="flex flex-col gap-2">
            <button type="button" onClick={() => void copyDetails()} disabled={copying} className="flex items-center gap-2 px-3 py-2 border border-[var(--erp-hairline)] text-left text-xs hover:border-[var(--erp-gold)] disabled:opacity-60">
              {copying ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} Copy Details
            </button>
            <a href={whatsappUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2 border border-[var(--erp-hairline)] text-xs hover:border-[var(--erp-gold)]" onClick={() => setShareOpen(false)}>
              <MessageCircle className="w-3.5 h-3.5" /> Share via WhatsApp
            </a>
          </div>
        </div>
      )}
    </div>
  );
};
