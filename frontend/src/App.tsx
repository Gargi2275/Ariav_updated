import React from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { ErpProvider, useErp } from './context/ErpContext';
import { TopBar } from './components/layout/TopBar';
import { IconRail } from './components/layout/IconRail';
import { QuickJumpModal } from './components/common/QuickJumpModal';

// Auth Screens (1 - 4)
import { LoginScreen } from './screens/auth/LoginScreen';
import { OperatorWaitingScreen } from './screens/auth/OperatorWaitingScreen';
import { AdminPinSetupScreen } from './screens/auth/AdminPinSetupScreen';
import { VerbalOtpScreen } from './screens/auth/VerbalOtpScreen';

// Admin Screens (5 - 10)
import { ApprovalQueueScreen } from './screens/admin/ApprovalQueueScreen';
import { AnalyticsDashboardScreen } from './screens/admin/AnalyticsDashboardScreen';
import { MenuRightsScreen } from './screens/admin/MenuRightsScreen';
import { AuditLogScreen } from './screens/admin/AuditLogScreen';
import { BackupScreen } from './screens/admin/BackupScreen';
import { YearEndClosingScreen } from './screens/admin/YearEndClosingScreen';

// Core Operations Screens (11 - 20)
import { OrderFormScreen } from './screens/core/OrderFormScreen';
import { SalesInvoiceScreen } from './screens/core/SalesInvoiceScreen';
import { BankReceiptVoucherScreen } from './screens/core/BankReceiptVoucherScreen';
import { CashReceiptVoucherScreen } from './screens/core/CashReceiptVoucherScreen';
import { PaymentVoucherScreen } from './screens/core/PaymentVoucherScreen';
import { JournalEntryScreen } from './screens/core/JournalEntryScreen';
import { CreditDebitNoteScreen } from './screens/core/CreditDebitNoteScreen';
import { DebitNoteScreen } from './screens/core/DebitNoteScreen';
import { MaterialReturnedScreen } from './screens/core/MaterialReturnedScreen';
import { PaymentAdjustmentScreen } from './screens/core/PaymentAdjustmentScreen';

// Masters Screens (21 - 28)
import { ItemMasterScreen } from './screens/masters/ItemMasterScreen';
import { GroupProductScreen } from './screens/masters/GroupProductScreen';
import { PartyMasterScreen } from './screens/masters/PartyMasterScreen';
import { BranchMasterScreen } from './screens/masters/BranchMasterScreen';
import { ParametersScreen } from './screens/masters/ParametersScreen';
import { ChartOfAccountsScreen } from './screens/masters/ChartOfAccountsScreen';
import { TaxSlabMasterScreen } from './screens/masters/TaxSlabMasterScreen';
import { BrokerMasterScreen } from './screens/masters/BrokerMasterScreen';

// Reports Screens (29 - 35)
import { SalesRegisterScreen } from './screens/reports/SalesRegisterScreen';
import { PurchaseRegisterScreen } from './screens/reports/PurchaseRegisterScreen';
import { PartyLedgerReportScreen } from './screens/reports/PartyLedgerReportScreen';
import { TrialBalanceScreen } from './screens/reports/TrialBalanceScreen';
import { BalanceSheetScreen } from './screens/reports/BalanceSheetScreen';
import { ProfitAndLossScreen } from './screens/reports/ProfitAndLossScreen';
import { BankCashBookScreen } from './screens/reports/BankCashBookScreen';

import { CheckCircle2, AlertTriangle, Info, Terminal, Sparkles } from 'lucide-react';

const ScreenDispatcher: React.FC = () => {
  const { currentScreenId } = useErp();

  switch (currentScreenId) {
    // Auth Module
    case 1:
      return <LoginScreen />;
    case 2:
      return <OperatorWaitingScreen />;
    case 3:
      return <VerbalOtpScreen />;
    case 4:
      return <AdminPinSetupScreen />;

    // Admin Module
    case 5:
      return <ApprovalQueueScreen />;
    case 6:
      return <AnalyticsDashboardScreen />;
    case 7:
      return <MenuRightsScreen />;
    case 8:
      return <AuditLogScreen />;
    case 9:
      return <BackupScreen />;
    case 10:
      return <YearEndClosingScreen />;

    // Core Operations
    case 11:
      return <OrderFormScreen />;
    case 12:
      return <SalesInvoiceScreen />;
    case 13:
      return <BankReceiptVoucherScreen />;
    case 14:
      return <CashReceiptVoucherScreen />;
    case 15:
      return <PaymentVoucherScreen />;
    case 16:
      return <JournalEntryScreen />;
    case 17:
      return <CreditDebitNoteScreen />;
    case 18:
      return <DebitNoteScreen />;
    case 19:
      return <MaterialReturnedScreen />;
    case 20:
      return <PaymentAdjustmentScreen />;

    // Masters
    case 21:
      return <ItemMasterScreen />;
    case 22:
      return <GroupProductScreen />;
    case 23:
      return <PartyMasterScreen />;
    case 24:
      return <BranchMasterScreen />;
    case 25:
      return <ParametersScreen />;
    case 26:
      return <ChartOfAccountsScreen />;
    case 27:
      return <TaxSlabMasterScreen />;
    case 28:
      return <BrokerMasterScreen />;

    // Reports
    case 29:
      return <SalesRegisterScreen />;
    case 30:
      return <PurchaseRegisterScreen />;
    case 31:
      return <PartyLedgerReportScreen />;
    case 32:
      return <TrialBalanceScreen />;
    case 33:
      return <BalanceSheetScreen />;
    case 34:
      return <ProfitAndLossScreen />;
    case 35:
      return <BankCashBookScreen />;

    default:
      return <AnalyticsDashboardScreen />;
  }
};

const ErpShell: React.FC = () => {
  const { currentScreenId, flashMessage, clearFlash, setQuickJumpOpen, pythonOnline, pythonStatus } = useErp();

  // Screens 1 - 4 are dedicated full-page Auth Gates (Login, Operator Waiting, Verbal OTP, Admin PIN Setup)
  if (currentScreenId <= 4) {
    return (
      <div className="min-h-screen w-full relative select-none overflow-x-hidden bg-[var(--erp-base)] flex flex-col justify-center items-center">
        {/* Global Toast Notification */}
        {flashMessage && (
          <div className="fixed top-5 right-6 z-50 animate-in fade-in slide-in-from-top-3 duration-200">
            <div
              onClick={clearFlash}
              className={`cursor-pointer px-4 py-3 border shadow-2xl flex items-center gap-3 font-mono text-xs ${
                flashMessage.type === 'positive'
                  ? 'bg-[var(--erp-surface-2)] border-[var(--erp-positive)] text-[var(--erp-positive)]'
                  : flashMessage.type === 'negative'
                  ? 'bg-[var(--erp-surface-2)] border-[var(--erp-negative)] text-[var(--erp-negative)]'
                  : 'bg-[var(--erp-surface-2)] border-[var(--erp-gold)] text-[var(--erp-gold)]'
              }`}
            >
              {flashMessage.type === 'positive' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
              {flashMessage.type === 'negative' && <AlertTriangle className="w-4 h-4 shrink-0" />}
              {flashMessage.type === 'gold' && <Sparkles className="w-4 h-4 shrink-0" />}
              <span>{flashMessage.text}</span>
            </div>
          </div>
        )}
        <ScreenDispatcher />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--erp-base)] text-[var(--erp-text)] flex flex-col font-sans antialiased select-none">
      {/* Global Toast Notification */}
      {flashMessage && (
        <div className="fixed top-4 right-6 z-50 animate-in fade-in slide-in-from-top-3 duration-200">
          <div
            onClick={clearFlash}
            className={`cursor-pointer px-4 py-3 border shadow-2xl flex items-center gap-3 font-mono text-xs ${
              flashMessage.type === 'positive'
                ? 'bg-[var(--erp-surface-2)] border-[var(--erp-positive)] text-[var(--erp-positive)]'
                : flashMessage.type === 'negative'
                ? 'bg-[var(--erp-surface-2)] border-[var(--erp-negative)] text-[var(--erp-negative)]'
                : 'bg-[var(--erp-surface-2)] border-[var(--erp-gold)] text-[var(--erp-gold)]'
            }`}
          >
            {flashMessage.type === 'positive' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            {flashMessage.type === 'negative' && <AlertTriangle className="w-4 h-4 shrink-0" />}
            {flashMessage.type === 'gold' && <Sparkles className="w-4 h-4 shrink-0" />}
            <span>{flashMessage.text}</span>
          </div>
        </div>
      )}

      {/* Main Layout Container */}
      <div className="flex flex-1 w-full relative">
        {/* Persistent 76px Icon Rail */}
        <IconRail />

        {/* Primary Viewport */}
        <div className="flex-1 flex flex-col min-w-0 bg-[var(--erp-base)]">
          {/* Top Bar with Branch, FY, Clock, Approvals, Cmd+K, Theme */}
          <TopBar />

          {/* Active Screen Canvas */}
          <main className="flex-1 overflow-y-auto">
            <ScreenDispatcher />
          </main>

          {/* Bottom Financial Status Bar */}
          <footer
            className="h-7 border-t border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)]/90 backdrop-blur-xs px-4 flex items-center justify-between text-[11px] font-mono text-[var(--erp-muted)]"
            style={{
              borderColor: 'var(--erp-hairline-strong)',
              boxShadow: '0 -1px 0 var(--erp-hairline)'
            }}
          >
            <div className="flex items-center gap-3 md:gap-4 overflow-hidden">
              <span className="flex items-center gap-1.5 text-[var(--erp-positive)] shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--erp-positive)] animate-pulse" />
                <span className="hidden sm:inline">AGENCY GATEWAY: ONLINE</span>
                <span className="sm:hidden">GATEWAY: OK</span>
              </span>
              <span className="text-[var(--erp-hairline-strong)]">|</span>
              <span className={`flex items-center gap-1.5 shrink-0 ${pythonOnline ? 'text-[var(--erp-positive)]' : 'text-[var(--erp-gold)]'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${pythonOnline ? 'bg-[var(--erp-positive)]' : 'bg-[var(--erp-gold)] animate-pulse'}`} />
                <span>PYTHON AUTH BACKEND: {pythonOnline ? 'CONNECTED (:5001)' : 'CONNECTING...'}</span>
              </span>
              <span className="hidden md:inline text-[var(--erp-hairline-strong)]">|</span>
              <span className="hidden md:inline">SURAT MAIN TERMINAL #01</span>
              <span className="hidden lg:inline text-[var(--erp-hairline-strong)]">|</span>
              <span className="hidden lg:inline font-mono">SQLITE3 AUTH DB</span>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <span className="hidden sm:inline font-mono">
                Press <kbd className="px-1 py-0.5 border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)] text-[var(--erp-gold)] font-mono">Cmd+K</kbd> to jump
              </span>
              <span className="text-[var(--erp-hairline-strong)]">|</span>
              <span className="font-mono font-semibold text-[var(--erp-text)]">ARIAV ERP v4.2</span>
            </div>
          </footer>
        </div>
      </div>

      {/* Cmd+K Quick Navigation Modal */}
      <QuickJumpModal />
    </div>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <ErpProvider>
        <ErpShell />
      </ErpProvider>
    </ThemeProvider>
  );
}
