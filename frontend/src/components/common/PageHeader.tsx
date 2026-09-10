import React from 'react';
import { useErp } from '../../context/ErpContext';

interface PageHeaderProps {
  moduleNumber?: number | string;
  section?: string;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  moduleNumber,
  section,
  title,
  subtitle,
  actions,
  className = ''
}) => {
  const { currentScreen } = useErp();

  const modNum = moduleNumber !== undefined
    ? (typeof moduleNumber === 'number' ? moduleNumber.toString().padStart(2, '0') : moduleNumber)
    : currentScreen.id.toString().padStart(2, '0');

  const secName = section || currentScreen.category;
  const pageTitle = title || currentScreen.title;
  const pageSubtitle = subtitle || currentScreen.subtitle;

  return (
    <div className={`flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[var(--erp-hairline-strong)] pb-5 ${className}`}>
      <div className="flex flex-col text-left min-w-0">
        {/* 1. Single breadcrumb line: "06 · Admin · Business Analytics & Position" in --font-body, small, muted */}
        <div className="font-body text-xs text-[var(--erp-muted)] tracking-wide flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[var(--erp-muted)]">{modNum}</span>
          <span className="text-[var(--erp-hairline-strong)]">&middot;</span>
          <span>{secName}</span>
          <span className="text-[var(--erp-hairline-strong)]">&middot;</span>
          <span className="text-[var(--erp-text)] font-medium">{pageTitle}</span>
        </div>

        {/* 2. The H1 in --font-display, appears once */}
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[var(--erp-text)] mt-2">
          {pageTitle}
        </h1>

        {/* 3. The one-line subtitle under it in --font-body */}
        {pageSubtitle && (
          <p className="font-body text-xs sm:text-sm text-[var(--erp-muted)] mt-2 leading-relaxed max-w-4xl">
            {pageSubtitle}
          </p>
        )}
      </div>

      {/* Optional action buttons, aligned on the right */}
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0 sm:self-end">
          {actions}
        </div>
      )}
    </div>
  );
};
