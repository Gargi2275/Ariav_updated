import React, { useState } from 'react';
import { useErp } from '../../context/ErpContext';
import { ERP_SCREENS, ScreenCategory } from '../../types/erp';
import { Search, X, ChevronRight, Check } from 'lucide-react';

export const QuickJumpModal: React.FC = () => {
  const { quickJumpOpen, setQuickJumpOpen, currentScreenId, navigateTo, userRole } = useErp();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  if (!quickJumpOpen || !userRole) return null;

  const categories: string[] = ['All', 'Auth', 'Admin', 'Core Operations', 'Masters', 'Reports'];

  const filteredScreens = ERP_SCREENS.filter(s => {
    const matchesCategory = selectedCategory === 'All' || s.category === selectedCategory;
    const matchesSearch =
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.subtitle.toLowerCase().includes(search.toLowerCase()) ||
      s.id.toString() === search.trim() ||
      s.category.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/60 backdrop-blur-[2px]">
      <div
        className="w-full max-w-2xl bg-[var(--erp-surface-2)] border border-[var(--erp-gold)] shadow-2xl flex flex-col max-h-[80vh] overflow-hidden rounded-none animate-in fade-in zoom-in-95 duration-150"
        style={{ boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}
      >
        {/* Header & Search Bar */}
        <div className="p-3 border-b border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] flex items-center gap-3">
          <Search className="w-5 h-5 text-[var(--erp-gold)] flex-shrink-0" />
          <input
            type="text"
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search all ${ERP_SCREENS.length} screens by name, category, or number…`}
            className="w-full bg-transparent text-sm text-[var(--erp-text)] focus:outline-none placeholder:text-[var(--erp-faint)] font-sans"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-[var(--erp-muted)] hover:text-[var(--erp-text)]">
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setQuickJumpOpen(false)}
            className="p-1 border border-[var(--erp-hairline)] hover:border-[var(--erp-gold)] text-[var(--erp-muted)] hover:text-[var(--erp-text)]"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[var(--erp-hairline)] bg-[var(--erp-surface-2)] overflow-x-auto text-xs font-mono">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? 'bg-[var(--erp-gold)] text-[#0F141B] font-semibold'
                  : 'text-[var(--erp-muted)] hover:text-[var(--erp-text)] bg-[var(--erp-surface)] border border-[var(--erp-hairline)]'
              }`}
            >
              {cat}
            </button>
          ))}
          <span className="ml-auto text-[11px] text-[var(--erp-muted)] font-mono">
            {filteredScreens.length} of {ERP_SCREENS.length} Screens
          </span>
        </div>

        {/* List of Screens */}
        <div className="overflow-y-auto divide-y divide-[var(--erp-hairline)] max-h-[55vh]">
          {filteredScreens.map(screen => {
            const isCurrent = screen.id === currentScreenId;
            return (
              <div
                key={screen.id}
                onClick={() => {
                  navigateTo(screen.id);
                  setQuickJumpOpen(false);
                }}
                className={`p-3 cursor-pointer transition-colors flex items-center justify-between group ${
                  isCurrent
                    ? 'bg-[var(--erp-surface)] border-l-4 border-[var(--erp-gold)]'
                    : 'hover:bg-[var(--erp-surface)]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 flex items-center justify-center font-mono text-xs font-medium text-[var(--erp-gold)] bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] flex-shrink-0">
                    {screen.id.toString().padStart(2, '0')}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm ${isCurrent ? 'font-semibold text-[var(--erp-gold)]' : 'font-medium text-[var(--erp-text)] group-hover:text-[var(--erp-gold)] transition-colors'}`}>
                        {screen.title}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 border border-[var(--erp-hairline)] text-[var(--erp-muted)]">
                        {screen.category}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--erp-muted)] mt-0.5 font-sans">
                      {screen.subtitle}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isCurrent ? (
                    <span className="flex items-center gap-1 font-mono text-[11px] text-[var(--erp-positive)]">
                      <Check className="w-3.5 h-3.5" /> Active
                    </span>
                  ) : (
                    <span className="text-xs text-[var(--erp-muted)] opacity-0 group-hover:opacity-100 font-mono flex items-center gap-0.5 text-[var(--erp-gold)]">
                      Jump <ChevronRight className="w-3 h-3" />
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {filteredScreens.length === 0 && (
            <div className="p-8 text-center text-xs text-[var(--erp-muted)] font-mono">
              No ERP modules matching "{search}". Try searching "invoice", "ledger", or screen number.
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="p-2.5 border-t border-[var(--erp-hairline)] bg-[var(--erp-surface)] flex items-center justify-between text-[11px] font-mono text-[var(--erp-muted)]">
          <span>Tip: Press [Esc] to exit • Click any module to inspect screen</span>
          <span>Ariav Gujarat Entity ERP v4.2</span>
        </div>
      </div>
    </div>
  );
};
