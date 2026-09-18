import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

/** iOS-style theme switch, nested in the same header chrome as other toolbar buttons. */
export const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const isPaper = theme === 'light';
  const activeName = isPaper ? 'Paper Ledger' : 'Terminal';
  const otherName = isPaper ? 'Terminal' : 'Paper Ledger';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isPaper}
      aria-label={`${activeName} mode. Switch to ${otherName}.`}
      title={`${activeName} mode (active). Click to switch to ${otherName}.`}
      onClick={toggleTheme}
      className="h-8 px-1.5 inline-flex items-center justify-center shrink-0 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] hover:border-[var(--erp-gold)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--erp-gold)]"
    >
      <span
        aria-hidden
        className="relative h-5 w-10 rounded-full p-[2px] box-border overflow-hidden pointer-events-none"
        style={{
          backgroundColor: 'var(--erp-base)',
          boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.45), inset 0 -1px 0 rgba(255, 255, 255, 0.04)',
        }}
      >
        <span className="relative block h-full w-full">
          <Moon
            className={`absolute left-[3px] top-1/2 -translate-y-1/2 w-2.5 h-2.5 stroke-[1.75] text-[var(--erp-faint)] transition-opacity duration-[250ms] ease-out ${
              isPaper ? 'opacity-70' : 'opacity-0'
            }`}
          />
          <Sun
            className={`absolute right-[3px] top-1/2 -translate-y-1/2 w-2.5 h-2.5 stroke-[1.75] text-[var(--erp-faint)] transition-opacity duration-[250ms] ease-out ${
              isPaper ? 'opacity-0' : 'opacity-70'
            }`}
          />

          <span
            className="absolute top-0 left-0 z-10 h-full aspect-square rounded-full bg-[var(--erp-gold)] flex items-center justify-center motion-reduce:transition-none"
            style={{
              transform: isPaper ? 'translateX(100%)' : 'translateX(0)',
              transition: 'transform 250ms cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.4)',
            }}
          >
            {isPaper ? (
              <Sun className="w-3 h-3 stroke-[1.75] text-[var(--erp-base)]" />
            ) : (
              <Moon className="w-3 h-3 stroke-[1.75] text-[var(--erp-base)]" />
            )}
          </span>
        </span>
      </span>
    </button>
  );
};
