import React, { useState, useRef, useEffect } from 'react';
import { useErp } from '../../context/ErpContext';
import { ALL_ENTITIES, ALL_ENTITIES_ID } from '../../types/erp';
import { NotificationBell } from './NotificationBell';
import { IconCountBadge } from './IconCountBadge';
import { ThemeToggle } from './ThemeToggle';
import { 
  Building2, 
  Calendar, 
  Clock, 
  Command, 
  ShieldCheck, 
  UserCheck, 
  ClipboardCheck,
  SlidersHorizontal,
  ChevronDown,
  X
} from 'lucide-react';

export const TopBar: React.FC = () => {
  const { 
    branches, 
    selectedBranch, 
    setSelectedEntityId, 
    financialYear, 
    setFinancialYear,
    userRole,
    sessionUserName,
    approvalQueue,
    liveClock,
    setQuickJumpOpen,
    navigateTo
  } = useErp();

  const [mobileContextOpen, setMobileContextOpen] = useState(false);
  const contextRef = useRef<HTMLDivElement>(null);

  const pendingApprovalsCount = approvalQueue.filter(q => q.status === 'pending').length;

  // Close mobile context dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextRef.current && !contextRef.current.contains(e.target as Node)) {
        setMobileContextOpen(false);
      }
    };
    if (mobileContextOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [mobileContextOpen]);

  return (
    <header
      className="sticky top-0 z-30 h-13 min-h-[52px] border-b flex items-center justify-between px-3 sm:px-4 lg:px-5 bg-[var(--erp-surface)]/90 backdrop-blur-md border-[var(--erp-hairline-strong)] text-[var(--erp-text)] w-full overflow-visible select-none"
      style={{
        borderColor: 'var(--erp-hairline-strong)',
        boxShadow: '0 1px 0 var(--erp-hairline)'
      }}
    >
      {/* Left: mobile/tablet branch context */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Mobile/Tablet Compact Branch Indicator & Context Trigger (< lg) */}
        <div className="relative lg:hidden" ref={contextRef}>
          <button
            onClick={() => setMobileContextOpen(!mobileContextOpen)}
            className="flex items-center gap-1.5 px-2 py-1 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] hover:border-[var(--erp-gold)] text-xs font-mono text-[var(--erp-text)] transition-colors cursor-pointer"
            title="Change Branch / FY / Node"
          >
            <Building2 className="w-3.5 h-3.5 text-[var(--erp-gold)] shrink-0" />
            <span className="max-w-[90px] sm:max-w-[130px] truncate">
              {selectedBranch.name}
            </span>
            <ChevronDown className="w-3 h-3 text-[var(--erp-muted)] shrink-0" />
          </button>

          {/* Mobile Context Dropdown */}
          {mobileContextOpen && (
            <div className="absolute left-0 top-full mt-1.5 w-72 bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] shadow-2xl p-3 z-50 animate-in fade-in slide-in-from-top-2 duration-150 font-sans text-xs">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--erp-hairline)]">
                <span className="font-mono text-[10px] tracking-wider text-[var(--erp-muted)] uppercase">
                  Terminal Environment
                </span>
                <button
                  onClick={() => setMobileContextOpen(false)}
                  className="text-[var(--erp-muted)] hover:text-[var(--erp-text)] p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Branch Selector in Dropdown */}
              <div className="mb-3">
                <label className="block font-mono text-[10px] text-[var(--erp-muted)] mb-1">
                  ENTITY
                </label>
                <div className="relative">
                  <Building2 className="w-3.5 h-3.5 text-[var(--erp-gold)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <select
                    value={selectedBranch.id || ALL_ENTITIES_ID}
                    onChange={e => {
                      const value = e.target.value;
                      if (value === ALL_ENTITIES_ID) {
                        setSelectedEntityId(ALL_ENTITIES_ID);
                      } else {
                        const n = Number(value);
                        if (Number.isFinite(n)) setSelectedEntityId(n);
                      }
                      setMobileContextOpen(false);
                    }}
                    className="w-full pl-8 pr-3 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none"
                  >
                    <option value={ALL_ENTITIES_ID} className="bg-[var(--erp-surface)] text-[var(--erp-text)] font-mono">
                      {ALL_ENTITIES.name}
                    </option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id} className="bg-[var(--erp-surface)] text-[var(--erp-text)] font-mono">
                        {b.code} · {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Financial Year in Dropdown */}
              <div className="mb-3">
                <label className="block font-mono text-[10px] text-[var(--erp-muted)] mb-1">
                  FINANCIAL YEAR (FY)
                </label>
                <div className="relative">
                  <Calendar className="w-3.5 h-3.5 text-[var(--erp-gold)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <select
                    value={financialYear}
                    onChange={e => {
                      setFinancialYear(e.target.value);
                      setMobileContextOpen(false);
                    }}
                    className="w-full pl-9 pr-7 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none"
                  >
                    <option value="2025-26" className="bg-[var(--erp-surface)] text-[var(--erp-text)]">FY 2025-26 (Current)</option>
                    <option value="2024-25" className="bg-[var(--erp-surface)] text-[var(--erp-text)]">FY 2024-25</option>
                    <option value="2023-24" className="bg-[var(--erp-surface)] text-[var(--erp-text)]">FY 2023-24</option>
                  </select>
                </div>
              </div>

              {/* Live Clock Info */}
              <div className="pt-2 border-t border-[var(--erp-hairline)] flex items-center justify-between font-mono text-[10px] text-[var(--erp-muted)]">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-[var(--erp-gold)]" />
                  IST Time:
                </span>
                <span className="text-[var(--erp-text)] font-semibold">{liveClock}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Controls: Branch, FY, Clock, Approvals, Quick Jump, Theme, Profile, Logout */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* Desktop Branch Selector (lg:flex, with max-width restraint) */}
        <div className="relative hidden lg:flex items-center">
          <Building2 className="w-3.5 h-3.5 stroke-[1.75] text-[var(--erp-gold)] absolute left-2.5 pointer-events-none" />
          <select
            value={selectedBranch.id || ALL_ENTITIES_ID}
            onChange={e => {
              const value = e.target.value;
              if (value === ALL_ENTITIES_ID) {
                setSelectedEntityId(ALL_ENTITIES_ID);
                return;
              }
              const n = Number(value);
              if (Number.isFinite(n)) setSelectedEntityId(n);
            }}
            className="pl-7 pr-6 py-1 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:outline-none focus:border-[var(--erp-gold)] rounded-none cursor-pointer min-w-[200px] max-w-[280px] xl:max-w-[360px] 2xl:max-w-[420px]"
            title={selectedBranch.id === ALL_ENTITIES_ID ? ALL_ENTITIES.name : `${selectedBranch.code} · ${selectedBranch.name}`}
          >
            <option value={ALL_ENTITIES_ID} className="bg-[var(--erp-surface)] text-[var(--erp-text)] font-mono">
              {ALL_ENTITIES.name}
            </option>
            {branches.map(b => (
              <option key={b.id} value={b.id} className="bg-[var(--erp-surface)] text-[var(--erp-text)] font-mono">
                {b.code} · {b.name}
              </option>
            ))}
          </select>
        </div>

        {/* Financial Year Selector (hidden on smaller laptops, visible on xl) */}
        <div className="relative hidden xl:flex items-center">
          <Calendar className="w-3.5 h-3.5 stroke-[1.75] text-[var(--erp-gold)] absolute left-2.5 pointer-events-none" />
          <select
            value={financialYear}
            onChange={e => setFinancialYear(e.target.value)}
            className="pl-9 pr-7 py-1 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:outline-none focus:border-[var(--erp-gold)] rounded-none cursor-pointer min-w-[152px]"
          >
            <option value="2025-26" className="bg-[var(--erp-surface)] text-[var(--erp-text)] font-mono">FY 2025-26</option>
            <option value="2024-25" className="bg-[var(--erp-surface)] text-[var(--erp-text)] font-mono">FY 2024-25</option>
            <option value="2023-24" className="bg-[var(--erp-surface)] text-[var(--erp-text)] font-mono">FY 2023-24</option>
          </select>
        </div>

        {/* Live Clock (visible on 2xl screens to avoid taking precious width) */}
        <div className="hidden 2xl:flex items-center gap-1.5 px-2.5 py-1 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-xs font-mono text-[var(--erp-muted)] whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 stroke-[1.75] text-[var(--erp-gold)] shrink-0" />
          <span className="tracking-tight text-[var(--erp-text)] font-mono">{liveClock}</span>
        </div>

        <ThemeToggle />

        {/* Notifications — in-app reminders (unread badge) */}
        <NotificationBell />

        {/* Pending operator login approvals (Live Approval Queue) */}
        <button
          type="button"
          onClick={() => navigateTo(5)}
          title={`Pending approvals (${pendingApprovalsCount})`}
          aria-label={`Pending operator login approvals, ${pendingApprovalsCount} waiting`}
          className="relative h-8 w-8 inline-flex items-center justify-center bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] hover:border-[var(--erp-negative)] transition-colors cursor-pointer"
        >
          <ClipboardCheck className="w-3.5 h-3.5 stroke-[1.75] text-[var(--erp-negative)] shrink-0" />
          <IconCountBadge count={pendingApprovalsCount} tone="rose" />
        </button>

        {/* Quick Screen Switcher (Cmd+K) */}
        <button
          type="button"
          onClick={() => setQuickJumpOpen(true)}
          className="h-8 w-8 inline-flex items-center justify-center bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] hover:border-[var(--erp-gold)] transition-colors text-[var(--erp-muted)] hover:text-[var(--erp-text)] cursor-pointer"
          title="Modules (⌘K)"
          aria-label="Open modules (Command K)"
        >
          <Command className="w-3.5 h-3.5 text-[var(--erp-gold)]" />
        </button>

        {/* Session role badge — read-only; role comes from /api/auth/me/ */}
        <div
          className="flex items-center gap-2 pl-1.5 sm:pl-2 border-l border-[var(--erp-hairline)] select-none shrink-0"
          title={userRole === 'admin' ? 'Admin session' : 'Operator session'}
          aria-label={userRole === 'admin' ? 'Admin' : 'Operator'}
        >
          <div className="w-7 h-7 rounded-none bg-[var(--erp-gold)]/20 border border-[var(--erp-gold)] flex items-center justify-center font-mono text-xs font-semibold text-[var(--erp-gold)] shrink-0">
            {userRole === 'admin' ? 'AD' : 'OP'}
          </div>
          <div className="hidden lg:flex flex-col text-left whitespace-nowrap">
            <span className="text-xs font-medium text-[var(--erp-text)] leading-tight">
              {sessionUserName || (userRole === 'admin' ? 'Admin' : 'Operator')}
            </span>
            <span className="text-[10px] font-mono text-[var(--erp-muted)] leading-tight flex items-center gap-1">
              {userRole === 'admin' ? (
                <>
                  <ShieldCheck className="w-3 h-3 text-[var(--erp-positive)]" /> Admin
                </>
              ) : (
                <>
                  <UserCheck className="w-3 h-3 text-[var(--erp-gold)]" /> Operator
                </>
              )}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
