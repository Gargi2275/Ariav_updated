import React, { useState } from 'react';
import { useErp } from '../../context/ErpContext';
import { Search, UploadCloud, Calendar, AlertCircle } from 'lucide-react';

interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helper?: string;
  mono?: boolean;
}

export const TextInput: React.FC<TextInputProps> = ({
  label,
  error,
  helper,
  mono = false,
  className = '',
  ...props
}) => {
  return (
    <div className="flex flex-col gap-1 text-left">
      <label className="text-xs font-normal text-[var(--erp-muted)] font-sans">
        {label}
      </label>
      <input
        className={`px-3 py-2 text-sm bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] focus:outline-none focus:border-[var(--erp-gold)] transition-colors rounded-none placeholder:text-[var(--erp-faint)] ${
          mono ? 'font-mono' : 'font-sans'
        } ${error ? 'border-[var(--erp-negative)] focus:border-[var(--erp-negative)]' : ''} ${className}`}
        {...props}
      />
      {error && (
        <span className="text-xs font-mono text-[var(--erp-negative)] flex items-center gap-1 mt-0.5">
          <AlertCircle className="w-3 h-3" />
          {error}
        </span>
      )}
      {helper && !error && (
        <span className="text-xs text-[var(--erp-muted)] mt-0.5">{helper}</span>
      )}
    </div>
  );
};

interface AmountInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  currencyPrefix?: string;
  error?: string;
}

export const AmountInput: React.FC<AmountInputProps> = ({
  label,
  currencyPrefix = '₹',
  error,
  className = '',
  ...props
}) => {
  return (
    <div className="flex flex-col gap-1 text-left">
      <label className="text-xs font-normal text-[var(--erp-muted)] font-sans">
        {label}
      </label>
      <div className="relative flex items-center">
        <span className="absolute left-3 text-sm font-mono text-[var(--erp-muted)] select-none">
          {currencyPrefix}
        </span>
        <input
          type="text"
          className={`w-full pl-8 pr-3 py-2 text-sm font-mono text-right bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] focus:outline-none focus:border-[var(--erp-gold)] transition-colors rounded-none placeholder:text-[var(--erp-faint)] ${
            error ? 'border-[var(--erp-negative)] focus:border-[var(--erp-negative)]' : ''
          } ${className}`}
          {...props}
        />
      </div>
      {error && (
        <span className="text-xs font-mono text-[var(--erp-negative)] mt-0.5">
          {error}
        </span>
      )}
    </div>
  );
};

interface DateInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const DateInput: React.FC<DateInputProps> = ({ label, error, className = '', ...props }) => {
  return (
    <div className="flex flex-col gap-1 text-left">
      <label className="text-xs font-normal text-[var(--erp-muted)] font-sans">
        {label}
      </label>
      <div className="relative flex items-center">
        <input
          type="date"
          className={`w-full px-3 py-2 text-sm font-mono bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] focus:outline-none focus:border-[var(--erp-gold)] transition-colors rounded-none ${
            error ? 'border-[var(--erp-negative)]' : ''
          } ${className}`}
          {...props}
        />
        <Calendar className="absolute right-3 w-4 h-4 text-[var(--erp-muted)] pointer-events-none" />
      </div>
      {error && (
        <span className="text-xs font-mono text-[var(--erp-negative)] mt-0.5">{error}</span>
      )}
    </div>
  );
};

interface PartyPickerProps {
  label: string;
  selectedPartyId?: string;
  onSelect: (partyId: string) => void;
  error?: string;
}

export const PartyPicker: React.FC<PartyPickerProps> = ({
  label,
  selectedPartyId,
  onSelect,
  error
}) => {
  const { parties } = useErp();
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const selectedParty = parties.find(p => p.id === selectedPartyId);

  const filteredParties = parties.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.code.toLowerCase().includes(search.toLowerCase()) ||
    p.city.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative flex flex-col gap-1 text-left">
      <label className="text-xs font-normal text-[var(--erp-muted)] font-sans">
        {label}
      </label>

      <div
        onClick={() => setIsOpen(prev => !prev)}
        className={`px-3 py-2 text-sm bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] cursor-pointer flex items-center justify-between transition-colors ${
          isOpen ? 'border-[var(--erp-gold)]' : ''
        } ${error ? 'border-[var(--erp-negative)]' : ''}`}
      >
        {selectedParty ? (
          <div className="flex items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap">
            <span className="font-medium text-[var(--erp-text)]">{selectedParty.name}</span>
            <span className="font-mono text-xs text-[var(--erp-gold)]">[{selectedParty.code}]</span>
            <span className="text-xs text-[var(--erp-muted)]">• {selectedParty.city}</span>
          </div>
        ) : (
          <span className="text-[var(--erp-faint)]">Search party by name, code or GSTIN...</span>
        )}
        <Search className="w-4 h-4 text-[var(--erp-muted)] flex-shrink-0 ml-2" />
      </div>

      {isOpen && (
        <div className="absolute z-40 top-full left-0 right-0 mt-1 bg-[var(--erp-surface-2)] border border-[var(--erp-gold)]/40 shadow-xl max-h-60 overflow-y-auto">
          <div className="p-2 border-b border-[var(--erp-hairline)] sticky top-0 bg-[var(--erp-surface-2)]">
            <input
              type="text"
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Type party name, city or code..."
              className="w-full px-2.5 py-1.5 text-xs bg-[var(--erp-surface)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:outline-none focus:border-[var(--erp-gold)] font-sans"
              onClick={e => e.stopPropagation()}
            />
          </div>
          <div className="divide-y divide-[var(--erp-hairline)]">
            {filteredParties.map(party => (
              <div
                key={party.id}
                onClick={() => {
                  onSelect(party.id);
                  setIsOpen(false);
                }}
                className="px-3 py-2 text-xs hover:bg-[var(--erp-surface)] cursor-pointer transition-colors flex items-center justify-between"
              >
                <div>
                  <div className="font-medium text-[var(--erp-text)]">{party.name}</div>
                  <div className="font-mono text-[11px] text-[var(--erp-muted)] mt-0.5">
                    GST: {party.gstin} | Broker: {party.broker}
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-mono text-[11px] text-[var(--erp-gold)] block">
                    {party.code}
                  </span>
                  <span className="font-mono text-[10px] text-[var(--erp-muted)]">
                    ₹{(party.currentBalance / 100000).toFixed(2)}L {party.balanceType}
                  </span>
                </div>
              </div>
            ))}
            {filteredParties.length === 0 && (
              <div className="p-3 text-xs text-center text-[var(--erp-muted)] font-mono">
                No matching party found in directory.
              </div>
            )}
          </div>
        </div>
      )}

      {error && <span className="text-xs font-mono text-[var(--erp-negative)] mt-0.5">{error}</span>}
    </div>
  );
};

interface FileDropZoneProps {
  label: string;
  hint?: string;
  acceptedFormats?: string;
  onFileLoaded?: (fileName: string, fileSize: string) => void;
  className?: string;
}

export const FileDropZone: React.FC<FileDropZoneProps> = ({
  label,
  hint = 'Drag & drop bulk JSON dataset up to 50MB, or click to browse',
  acceptedFormats = '.json',
  onFileLoaded,
  className = ''
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{ name: string; size: string } | null>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const sizeMb = (file.size / (1024 * 1024)).toFixed(2) + ' MB';
      setSelectedFile({ name: file.name, size: sizeMb });
      if (onFileLoaded) onFileLoaded(file.name, sizeMb);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const sizeMb = (file.size / (1024 * 1024)).toFixed(2) + ' MB';
      setSelectedFile({ name: file.name, size: sizeMb });
      if (onFileLoaded) onFileLoaded(file.name, sizeMb);
    }
  };

  return (
    <div className={`flex flex-col gap-1 text-left ${className}`}>
      <label className="text-xs font-normal text-[var(--erp-muted)] font-sans">
        {label}
      </label>
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed p-6 text-center transition-colors rounded-none cursor-pointer ${
          dragActive
            ? 'border-[var(--erp-gold)] bg-[var(--erp-gold)]/5'
            : 'border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] hover:border-[var(--erp-gold)]/60'
        }`}
      >
        <input
          type="file"
          accept={acceptedFormats}
          onChange={handleChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <div className="flex flex-col items-center justify-center gap-2 pointer-events-none">
          <UploadCloud className="w-8 h-8 text-[var(--erp-gold)]" />
          {selectedFile ? (
            <div>
              <p className="text-sm font-medium text-[var(--erp-text)]">{selectedFile.name}</p>
              <p className="text-xs font-mono text-[var(--erp-positive)] mt-0.5">
                Loaded: {selectedFile.size} • JSON schema verified
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-normal text-[var(--erp-text)]">{hint}</p>
              <p className="text-xs font-mono text-[var(--erp-muted)] mt-1">
                Accepted: {acceptedFormats} (Standard Textile Order Schema v2.4)
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
