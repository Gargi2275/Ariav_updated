import React, { useRef, useState } from 'react';
import { FileText, UploadCloud, X } from 'lucide-react';
import { FieldError, FormLabel } from './FormControls';

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileMatchesAccept(file: File, accept?: string): boolean {
  if (!accept) return true;
  const tokens = accept.split(',').map(part => part.trim().toLowerCase()).filter(Boolean);
  if (!tokens.length) return true;
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  return tokens.some(token => {
    if (token.startsWith('.')) return name.endsWith(token);
    if (token.endsWith('/*')) return type.startsWith(token.slice(0, -1));
    return type === token;
  });
}

export interface FileDropZoneProps {
  label?: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  helper?: string;
  accept?: string;
  file: File | null;
  onChange: (file: File | null) => void;
  className?: string;
  id?: string;
  emptyTitle?: string;
  disabled?: boolean;
  existingHint?: React.ReactNode;
}

export const FileDropZone: React.FC<FileDropZoneProps> = ({
  label,
  htmlFor,
  required = false,
  error,
  helper,
  accept,
  file,
  onChange,
  className = '',
  id,
  emptyTitle = 'Click to upload or drag and drop',
  disabled = false,
  existingHint,
}) => {
  const inputId = htmlFor || id;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const applyFile = (next: File | null) => {
    if (next && accept && !fileMatchesAccept(next, accept)) return;
    onChange(next);
    if (!next && inputRef.current) inputRef.current.value = '';
  };

  const onDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    if (e.type === 'dragleave') setDragActive(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (disabled) return;
    const dropped = e.dataTransfer.files?.[0] || null;
    if (dropped) applyFile(dropped);
  };

  const openPicker = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  const borderClass = error
    ? 'border-[var(--erp-negative)]'
    : dragActive
      ? 'border-[var(--erp-gold)] bg-[rgba(201,162,78,0.10)]'
      : 'border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] hover:border-[var(--erp-gold)] hover:bg-[rgba(201,162,78,0.04)]';

  return (
    <div className={`flex flex-col gap-1 text-left ${className}`}>
      {label ? (
        <FormLabel htmlFor={inputId} required={required}>{label}</FormLabel>
      ) : null}
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        disabled={disabled}
        className="hidden"
        onChange={e => applyFile(e.target.files?.[0] || null)}
      />
      {file ? (
        <div className={`flex items-center gap-3 px-3 py-3 border ${error ? 'border-[var(--erp-negative)]' : 'border-[var(--erp-hairline-strong)]'} bg-[var(--erp-surface)]`}>
          <FileText className="w-5 h-5 text-[var(--erp-gold)] shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[var(--erp-text)] truncate">
              {file.name} <span className="font-mono text-[11px] text-[var(--erp-muted)] font-normal">· {formatFileSize(file.size)}</span>
            </p>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => applyFile(null)}
            className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-negative)] cursor-pointer"
            title="Remove file"
            aria-label="Remove file"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={openPicker}
          onDragEnter={onDrag}
          onDragLeave={onDrag}
          onDragOver={onDrag}
          onDrop={onDrop}
          className={`w-full border-2 border-dashed p-6 text-center transition-colors rounded-none cursor-pointer ${borderClass} disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <span className="flex flex-col items-center justify-center gap-2 pointer-events-none">
            <UploadCloud className="w-8 h-8 text-[var(--erp-gold)]" />
            <span className="text-sm font-medium text-[var(--erp-text)]">{emptyTitle}</span>
          </span>
        </button>
      )}
      {helper && !error ? (
        <span className="text-[11px] font-mono text-[var(--erp-muted)]">{helper}</span>
      ) : null}
      {existingHint && !file ? existingHint : null}
      <FieldError message={error} />
    </div>
  );
};
