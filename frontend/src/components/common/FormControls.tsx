import React, { useState } from 'react';
import { useErp } from '../../context/ErpContext';
import { Search, Calendar, AlertCircle } from 'lucide-react';

export function RequiredMark() {
  return (
    <span className="ml-0.5 text-[var(--erp-negative)] font-semibold" aria-hidden="true">
      *
    </span>
  );
}

export function FormLabel({
  htmlFor,
  required = false,
  children,
  className = 'text-xs font-normal text-[var(--erp-muted)] font-sans',
}: {
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={className}>
      {children}
      {required ? <RequiredMark /> : null}
    </label>
  );
}

export function RequiredLegend() {
  return (
    <p className="text-[11px] font-mono text-[var(--erp-muted)]">
      <RequiredMark /> Required field
    </p>
  );
}

export const FORM_SECTION_TITLE =
  'text-[11px] font-mono uppercase tracking-wider text-[var(--erp-gold)] border-b border-[var(--erp-hairline)] pb-1 mb-3';

export function FormSectionTitle({
  required = false,
  children,
}: {
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <h4 className={FORM_SECTION_TITLE}>
      {children}
      {required ? <RequiredMark /> : null}
    </h4>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <span className="text-xs font-mono text-[var(--erp-negative)] flex items-center gap-1 mt-0.5">
      <AlertCircle className="w-3 h-3 shrink-0" />
      {message}
    </span>
  );
}

export function FormField({
  label,
  htmlFor,
  required = false,
  error,
  helper,
  className = '',
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  helper?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1 text-left ${className}`}>
      <FormLabel htmlFor={htmlFor} required={required}>{label}</FormLabel>
      {children}
      <FieldError message={error} />
      {helper && !error ? <span className="text-xs text-[var(--erp-muted)] mt-0.5">{helper}</span> : null}
    </div>
  );
}

interface TextInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'required'> {
  label: string;
  error?: string;
  /** Red border only — no helper text. Use with toast.error for API validation. */
  invalid?: boolean;
  helper?: string;
  mono?: boolean;
  /** Shows a red asterisk on the label. Native HTML5 required is not used. */
  required?: boolean;
}

export const TextInput = React.forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  {
    label,
    error,
    invalid = false,
    helper,
    mono = false,
    required = false,
    className = '',
    id,
    ...props
  },
  ref,
) {
  const autoId = React.useId();
  const inputId = id || autoId;
  const showErrorText = !!(error && error.trim());
  const bad = showErrorText || invalid;
  return (
    <div className="flex flex-col gap-1 text-left">
      <FormLabel htmlFor={inputId} required={required}>
        {label}
      </FormLabel>
      <input
        id={inputId}
        ref={ref}
        aria-invalid={bad || undefined}
        aria-required={required || undefined}
        className={`px-3 py-2 text-sm bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] focus:outline-none focus:border-[var(--erp-gold)] transition-colors rounded-none placeholder:text-[var(--erp-faint)] ${
          mono ? 'font-mono' : 'font-sans'
        } ${bad ? 'border-[var(--erp-negative)] focus:border-[var(--erp-negative)]' : ''} ${className}`}
        {...props}
      />
      <FieldError message={error} />
      {helper && !showErrorText && (
        <span className="text-xs text-[var(--erp-muted)] mt-0.5">{helper}</span>
      )}
    </div>
  );
});

interface AmountInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'required'> {
  label: string;
  currencyPrefix?: string;
  error?: string;
  required?: boolean;
}

export const AmountInput: React.FC<AmountInputProps> = ({
  label,
  currencyPrefix = '₹',
  error,
  required = false,
  className = '',
  ...props
}) => {
  return (
    <div className="flex flex-col gap-1 text-left">
      <FormLabel required={required}>{label}</FormLabel>
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

interface DateInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'required'> {
  label: string;
  error?: string;
  required?: boolean;
}

export const DateInput: React.FC<DateInputProps> = ({ label, error, required = false, className = '', ...props }) => {
  return (
    <div className="flex flex-col gap-1 text-left">
      <FormLabel required={required}>{label}</FormLabel>
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
  required?: boolean;
}

export const PartyPicker: React.FC<PartyPickerProps> = ({
  label,
  selectedPartyId,
  onSelect,
  error,
  required = false,
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
      <FormLabel required={required}>{label}</FormLabel>

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
