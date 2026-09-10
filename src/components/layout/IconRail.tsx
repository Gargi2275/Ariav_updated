import React, { useState, useEffect } from 'react';
import { useErp } from '../../context/ErpContext';
import { ERP_SCREENS } from '../../types/erp';
import { 
  Home,
  ShoppingBag,
  Receipt,
  Layers,
  Scale,
  Database,
  FileText,
  SlidersHorizontal,
  ShieldCheck,
  ChevronRight,
  LogOut
} from 'lucide-react';

interface NavGroup {
  id: string;
  label: string;
  title: string;
  icon: React.ReactNode;
  screenIds: number[];
  primaryScreenId: number;
}

export const IconRail: React.FC = () => {
  const { currentScreenId, navigateTo, logout } = useErp();
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);
  const [flyoutPlacement, setFlyoutPlacement] = useState<'top' | 'bottom'>('top');
  const [maxFlyoutHeight, setMaxFlyoutHeight] = useState<number>(380);

  // Close flyouts on window resize
  useEffect(() => {
    const handleResize = () => setHoveredGroupId(null);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Reorganized operational order as requested:
  // 1. Dashboard, 2. Orders, 3. Sales Invoice, 4. Vouchers, 5. Journal & Ledgers,
  // 6. Masters, 7. Reports, 8. Admin, and 9. Security & Audit (fixed at bottom with divider)
  const operationalGroups: NavGroup[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      title: 'Dashboard & Analytics',
      icon: <Home className="w-5 h-5 stroke-[1.75]" />,
      screenIds: [6],
      primaryScreenId: 6
    },
    {
      id: 'orders',
      label: 'Orders',
      title: 'Order Booking & Import',
      icon: <ShoppingBag className="w-5 h-5 stroke-[1.75]" />,
      screenIds: [11],
      primaryScreenId: 11
    },
    {
      id: 'sales-invoice',
      label: 'Invoice',
      title: 'Sales Tax Invoice',
      icon: <Receipt className="w-5 h-5 stroke-[1.75]" />,
      screenIds: [12],
      primaryScreenId: 12
    },
    {
      id: 'vouchers',
      label: 'Vouchers',
      title: 'Receipts & Payments',
      icon: <Layers className="w-5 h-5 stroke-[1.75]" />,
      screenIds: [13, 14, 15, 17, 18, 19, 20],
      primaryScreenId: 13
    },
    {
      id: 'journal-ledgers',
      label: 'Ledgers',
      title: 'Journal & Ledgers',
      icon: <Scale className="w-5 h-5 stroke-[1.75]" />,
      screenIds: [16, 31],
      primaryScreenId: 16
    },
    {
      id: 'masters',
      label: 'Masters',
      title: 'Textile & Account Masters',
      icon: <Database className="w-5 h-5 stroke-[1.75]" />,
      screenIds: [21, 22, 23, 24, 25, 26, 27, 28],
      primaryScreenId: 21
    },
    {
      id: 'reports',
      label: 'Reports',
      title: 'Financial & Statutory Reports',
      icon: <FileText className="w-5 h-5 stroke-[1.75]" />,
      screenIds: [29, 30, 32, 33, 34, 35],
      primaryScreenId: 29
    },
    {
      id: 'admin',
      label: 'Admin',
      title: 'Governance & Year-End',
      icon: <SlidersHorizontal className="w-5 h-5 stroke-[1.75]" />,
      screenIds: [5, 7, 9, 10],
      primaryScreenId: 5
    }
  ];

  // Fixed at bottom with divider (oversight rather than daily operational flow)
  const securityGroup: NavGroup = {
    id: 'security-audit',
    label: 'Security',
    title: 'Security & Forensic Audit',
    icon: <ShieldCheck className="w-5 h-5 stroke-[1.75]" />,
    screenIds: [1, 2, 3, 4, 8],
    primaryScreenId: 1
  };

  const handleMouseEnter = (groupId: string, e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const windowHeight = window.innerHeight;
    // Bottom oversight group (security) or any group in the lower half opens upwards
    const shouldOpenUpwards = groupId === 'security-audit' || rect.top > windowHeight * 0.48;
    
    setFlyoutPlacement(shouldOpenUpwards ? 'bottom' : 'top');
    
    if (shouldOpenUpwards) {
      // Available height upwards from bottom of button
      const availableHeight = rect.bottom - 20;
      setMaxFlyoutHeight(Math.max(220, Math.min(480, availableHeight)));
    } else {
      // Available height downwards from top of button
      const availableHeight = windowHeight - rect.top - 20;
      setMaxFlyoutHeight(Math.max(220, Math.min(480, availableHeight)));
    }
    
    setHoveredGroupId(groupId);
  };

  const renderNavButton = (group: NavGroup) => {
    const isActive = group.screenIds.includes(currentScreenId);
    return (
      <div
        key={group.id}
        className="relative w-full flex flex-col items-center"
        onMouseEnter={(e) => handleMouseEnter(group.id, e)}
        onMouseLeave={() => setHoveredGroupId(null)}
      >
        <button
          onClick={() => {
            if (!isActive) navigateTo(group.primaryScreenId);
          }}
          className={`w-14 h-12 flex flex-col items-center justify-center gap-0.5 transition-all rounded-none relative cursor-pointer ${
            isActive
              ? 'text-[var(--erp-gold)] bg-[var(--erp-surface-2)] border-l-2 border-[var(--erp-gold)]'
              : 'text-[var(--erp-muted)] hover:text-[var(--erp-text)] hover:bg-[var(--erp-surface-2)]/60'
          }`}
          title={group.title}
        >
          {group.icon}
          <span className="text-[10px] font-body font-medium tracking-tight">
            {group.label}
          </span>

          {/* Sub-badge indicating current screen inside category */}
          {isActive && (
            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[var(--erp-gold)]" />
          )}
        </button>

        {/* Flyout Menu on Hover with Screen list */}
        {hoveredGroupId === group.id && (
          <div
            className={`absolute left-[70px] z-50 w-72 sm:w-80 max-w-[calc(100vw-82px)] bg-[var(--erp-surface-2)] border border-[var(--erp-hairline-strong)] shadow-2xl p-2 text-left animate-in fade-in zoom-in-95 duration-100 before:absolute before:-left-3 before:top-0 before:bottom-0 before:w-4 before:content-[''] ${
              flyoutPlacement === 'bottom' ? 'bottom-0' : 'top-0'
            }`}
            style={{
              boxShadow: 'var(--erp-shadow)',
              borderColor: 'var(--erp-hairline-strong)'
            }}
          >
            <div className="px-2.5 py-1.5 border-b border-[var(--erp-hairline)] flex items-center justify-between">
              <span className="font-display text-xs font-semibold text-[var(--erp-text)]">
                {group.title}
              </span>
              <span className="font-mono text-[10px] text-[var(--erp-gold)] bg-[var(--erp-surface)] px-1.5 py-0.5 border border-[var(--erp-hairline)]">
                {group.screenIds.length} {group.screenIds.length === 1 ? 'Screen' : 'Screens'}
              </span>
            </div>
            <div 
              className="py-1 overflow-y-auto divide-y divide-[var(--erp-hairline)]/40 scrollbar-thin"
              style={{ maxHeight: `${Math.max(160, maxFlyoutHeight - 44)}px` }}
            >
              {group.screenIds.map(sId => {
                const screen = ERP_SCREENS.find(s => s.id === sId);
                if (!screen) return null;
                const isCurrent = screen.id === currentScreenId;
                return (
                  <div
                    key={screen.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigateTo(screen.id);
                      setHoveredGroupId(null);
                    }}
                    className={`px-2.5 py-2 cursor-pointer transition-colors flex items-center justify-between ${
                      isCurrent
                        ? 'bg-[var(--erp-surface)] border-l-2 border-[var(--erp-gold)] text-[var(--erp-gold)]'
                        : 'hover:bg-[var(--erp-surface)]/80 text-[var(--erp-text)]'
                    }`}
                  >
                    <div className="overflow-hidden pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] text-[var(--erp-gold)] font-medium">
                          #{screen.id.toString().padStart(2, '0')}
                        </span>
                        <span className={`font-body text-xs truncate ${isCurrent ? 'font-semibold text-[var(--erp-gold)]' : 'font-medium text-[var(--erp-text)]'}`}>
                          {screen.title}
                        </span>
                      </div>
                      <p className="font-body text-[10px] text-[var(--erp-muted)] truncate pl-4">
                        {screen.subtitle}
                      </p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-[var(--erp-muted)] shrink-0" />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      className="w-[76px] flex-shrink-0 h-screen sticky top-0 z-40 border-r flex flex-col items-center justify-between py-2.5 bg-[var(--erp-surface)] border-[var(--erp-hairline-strong)] select-none"
      style={{ borderColor: 'var(--erp-hairline-strong)' }}
    >
      {/* Brand Identity / Nameplate */}
      <div className="flex flex-col items-center gap-2 w-full px-2">
        <div 
          onClick={() => navigateTo(6)}
          className="w-12 h-12 border border-[var(--erp-gold)] bg-[var(--erp-surface-2)] flex flex-col items-center justify-center cursor-pointer transition-all hover:border-[var(--erp-gold-soft)] group"
          title="Ariav ERP Home (Dashboard)"
        >
          <span className="font-display text-lg font-bold text-[var(--erp-gold)] tracking-tighter leading-none group-hover:scale-105 transition-transform">
            AE
          </span>
          <span className="font-mono text-[8px] text-[var(--erp-muted)] tracking-widest leading-none mt-0.5 font-medium">
            1984
          </span>
        </div>
        <div className="w-8 h-[1px] bg-[var(--erp-hairline)]" />
      </div>

      {/* Main Operational Nav Categories: 1. Dashboard through 8. Admin */}
      <nav className="flex flex-col items-center gap-1 w-full my-auto">
        {operationalGroups.map(renderNavButton)}
      </nav>

      {/* Bottom Section: Separator + 9. Security & Audit + Search Tool */}
      <div className="w-full px-2 flex flex-col items-center gap-1.5 pt-1">
        {/* Visual divider separating operational flow from oversight */}
        <div className="w-10 h-[1px] bg-[var(--erp-hairline-strong)] my-0.5" />

        {/* 9. Security & Audit (Oversight item fixed at the bottom) */}
        {renderNavButton(securityGroup)}

        <div className="w-8 h-[1px] bg-[var(--erp-hairline)] my-0.5" />

        {/* Bottom Tool: Logout / Terminal Lock */}
        <button
          onClick={logout}
          className="w-12 h-10 flex flex-col items-center justify-center border border-[var(--erp-hairline)] hover:border-[var(--erp-negative)] hover:bg-[var(--erp-negative)]/10 text-[var(--erp-muted)] hover:text-[var(--erp-negative)] transition-colors cursor-pointer group"
          title="Log Out & Lock Terminal"
          aria-label="Log Out & Lock Terminal"
        >
          <LogOut className="w-3.5 h-3.5 stroke-[1.75] text-[var(--erp-muted)] group-hover:text-[var(--erp-negative)] transition-colors" />
          <span className="font-mono text-[9px] mt-0.5 group-hover:text-[var(--erp-negative)]">Exit</span>
        </button>
      </div>
    </aside>
  );
};
