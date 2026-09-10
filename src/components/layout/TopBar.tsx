import React, { useState, useRef, useEffect } from 'react';
import { useErp } from '../../context/ErpContext';
import { useTheme } from '../../context/ThemeContext';
import { 
  Building2, 
  Calendar, 
  Clock, 
  Sun, 
  Moon, 
  Command, 
  ShieldCheck, 
  UserCheck, 
  Bell,
  SlidersHorizontal,
  ChevronDown,
  X
} from 'lucide-react';

export const TopBar: React.FC = () => {
  const { 
    branches, 
    selectedBranch, 
    setSelectedBranch, 
    financialYear, 
    setFinancialYear,
    userRole,
    setUserRole,
    approvalQueue,
    liveClock,
    setQuickJumpOpen,
    navigateTo
  } = useErp();

  const { theme, toggleTheme } = useTheme();
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
      {/* Left: Global System Terminal Identity (Never wraps or breaks) */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-xs font-mono whitespace-nowrap">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--erp-positive)] shrink-0 animate-pulse" />
          <span className="font-semibold text-[var(--erp-text)] tracking-wider">
            BHARAT <span className="hidden sm:inline">TEXTILE </span>ERP
          </span>
          <span className="text-[var(--erp-hairline-strong)] hidden 2xl:inline">|</span>
          <span className="text-[var(--erp-muted)] hidden 2xl:inline">TERMINAL ONLINE</span>
        </div>

        {/* Mobile/Tablet Compact Branch Indicator & Context Trigger (< lg) */}
        <div className="relative lg:hidden" ref={contextRef}>
          <button
            onClick={() => setMobileContextOpen(!mobileContextOpen)}
            className="flex items-center gap-1.5 px-2 py-1 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] hover:border-[var(--erp-gold)] text-xs font-mono text-[var(--erp-text)] transition-colors cursor-pointer"
            title="Change Branch / FY / Node"
          >
            <Building2 className="w-3.5 h-3.5 text-[var(--erp-gold)] shrink-0" />
            <span className="max-w-[90px] sm:max-w-[130px] truncate">
              {selectedBranch.city}
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
                  OPERATING HUB / BRANCH
                </label>
                <div className="relative">
                  <Building2 className="w-3.5 h-3.5 text-[var(--erp-gold)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <select
                    value={selectedBranch.id}
                    onChange={e => {
                      const b = branches.find(br => br.id === e.target.value);
                      if (b) {
                        setSelectedBranch(b);
                        setMobileContextOpen(false);
                      }
                    }}
                    className="w-full pl-8 pr-3 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none"
                  >
                    {branches.map(b => (
                      <option key={b.id} value={b.id} className="bg-[var(--erp-surface)] text-[var(--erp-text)]">
                        {b.name} ({b.city})
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
                    className="w-full pl-8 pr-3 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none"
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
            value={selectedBranch.id}
            onChange={e => {
              const b = branches.find(br => br.id === e.target.value);
              if (b) setSelectedBranch(b);
            }}
            className="pl-7 pr-3 py-1 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:outline-none focus:border-[var(--erp-gold)] rounded-none cursor-pointer max-w-[150px] xl:max-w-[210px] 2xl:max-w-[260px] truncate"
            title={selectedBranch.name}
          >
            {branches.map(b => (
              <option key={b.id} value={b.id} className="bg-[var(--erp-surface)] text-[var(--erp-text)] font-mono">
                {b.name} ({b.city})
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
            className="pl-7 pr-3 py-1 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:outline-none focus:border-[var(--erp-gold)] rounded-none cursor-pointer w-[115px]"
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

        {/* Theme Toggle - Full dual capsule on 2xl+, compact icon button on smaller viewports */}
        <div className="hidden 2xl:flex">
          <button
            onClick={toggleTheme}
            className="flex items-center p-0.5 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] hover:border-[var(--erp-gold)] transition-all cursor-pointer select-none rounded-none"
            title={`Active Theme: ${theme === 'dark' ? 'Ledger Terminal' : 'Paper Ledger'}. Click to toggle.`}
            aria-label="Toggle ERP Theme"
          >
            <div className="flex items-center text-[11px] font-mono whitespace-nowrap">
              <span
                className={`px-2 py-1 flex items-center gap-1.5 transition-all ${
                  theme === 'dark'
                    ? 'bg-[var(--erp-base)] text-[var(--erp-gold)] font-bold shadow-xs'
                    : 'text-[var(--erp-muted)] hover:text-[var(--erp-text)]'
                }`}
              >
                <Moon className="w-3.5 h-3.5 stroke-[1.75] text-[var(--erp-gold)]" />
                <span>Terminal</span>
              </span>
              <span
                className={`px-2 py-1 flex items-center gap-1.5 transition-all ${
                  theme === 'light'
                    ? 'bg-[var(--erp-surface)] text-[var(--erp-gold)] font-bold shadow-xs'
                    : 'text-[var(--erp-muted)] hover:text-[var(--erp-text)]'
                }`}
              >
                <Sun className="w-3.5 h-3.5 stroke-[1.75] text-[var(--erp-gold)]" />
                <span>Paper Ledger</span>
              </span>
            </div>
          </button>
        </div>

        {/* Compact Theme Toggle (< 2xl) */}
        <button
          onClick={toggleTheme}
          className="2xl:hidden p-1.5 px-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] hover:border-[var(--erp-gold)] text-[var(--erp-text)] transition-colors cursor-pointer flex items-center gap-1"
          title={`Switch to ${theme === 'dark' ? 'Paper Ledger' : 'Terminal Dark'} theme`}
          aria-label="Toggle Theme"
        >
          {theme === 'dark' ? (
            <Sun className="w-3.5 h-3.5 text-[var(--erp-gold)]" />
          ) : (
            <Moon className="w-3.5 h-3.5 text-[var(--erp-muted)]" />
          )}
        </button>

        {/* Pending Approvals Shortcut */}
        <button
          onClick={() => navigateTo(5)}
          title="Open Live Approval Queue"
          className="relative px-2 py-1 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] hover:border-[var(--erp-gold)] transition-colors flex items-center gap-1.5 font-mono cursor-pointer whitespace-nowrap"
        >
          <Bell className="w-3.5 h-3.5 stroke-[1.75] text-[var(--erp-gold)] shrink-0" />
          <span className="erp-badge erp-badge-gold text-[10px] px-1.5 py-0">
            <span className="hidden sm:inline">QUEUE </span>{pendingApprovalsCount}
          </span>
        </button>

        {/* Quick Screen Switcher (Cmd+K) */}
        <button
          onClick={() => setQuickJumpOpen(true)}
          className="px-2 sm:px-2.5 py-1 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] hover:border-[var(--erp-gold)] transition-colors flex items-center gap-1.5 text-xs text-[var(--erp-muted)] hover:text-[var(--erp-text)] whitespace-nowrap cursor-pointer"
          title="Quick Jump / Search 35 ERP Modules (Cmd+K)"
        >
          <Command className="w-3.5 h-3.5 text-[var(--erp-gold)] shrink-0" />
          <span className="font-mono text-xs hidden md:inline">Modules</span>
          <kbd className="px-1 font-mono text-[10px] border border-[var(--erp-hairline)] bg-[var(--erp-surface)] hidden sm:inline">
            ⌘K
          </kbd>
        </button>

        {/* Role & User Avatar Toggle */}
        <div
          onClick={() => setUserRole(userRole === 'admin' ? 'operator' : 'admin')}
          className="flex items-center gap-2 pl-1.5 sm:pl-2 border-l border-[var(--erp-hairline)] cursor-pointer select-none group shrink-0"
          title="Click to toggle between Admin and Operator role"
        >
          <div className="w-7 h-7 rounded-none bg-[var(--erp-gold)]/20 border border-[var(--erp-gold)] flex items-center justify-center font-mono text-xs font-semibold text-[var(--erp-gold)] shrink-0">
            {userRole === 'admin' ? 'AD' : 'OP'}
          </div>
          <div className="hidden lg:flex flex-col text-left whitespace-nowrap">
            <span className="text-xs font-medium text-[var(--erp-text)] leading-tight group-hover:text-[var(--erp-gold)] transition-colors">
              {userRole === 'admin' ? 'Paresh Patel' : 'Bhavin Joshi'}
            </span>
            <span className="text-[10px] font-mono text-[var(--erp-muted)] leading-tight flex items-center gap-1">
              {userRole === 'admin' ? (
                <>
                  <ShieldCheck className="w-3 h-3 text-[var(--erp-positive)]" /> Admin (PIN)
                </>
              ) : (
                <>
                  <UserCheck className="w-3 h-3 text-[var(--erp-gold)]" /> Operator (OTP)
                </>
              )}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
