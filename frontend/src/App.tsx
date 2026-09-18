import React from 'react';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/ReactToastify.css';
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

// Core Operations Screens
import { BankReceiptVoucherScreen } from './screens/core/BankReceiptVoucherScreen';
import { CashReceiptVoucherScreen } from './screens/core/CashReceiptVoucherScreen';
import { PaymentVoucherScreen } from './screens/core/PaymentVoucherScreen';
import { CreditDebitNoteScreen } from './screens/core/CreditDebitNoteScreen';
import { DebitNoteScreen } from './screens/core/DebitNoteScreen';
import { MaterialReturnedScreen } from './screens/core/MaterialReturnedScreen';
import { PaymentAdjustmentScreen } from './screens/core/PaymentAdjustmentScreen';
import { PurchaseOrderScreen } from './screens/core/PurchaseOrderScreen';
import { DispatchScreen } from './screens/core/DispatchScreen';
import { InvoiceScreen } from './screens/core/InvoiceScreen';
import { PaymentScreen } from './screens/core/PaymentScreen';
import { PaymentAdjustmentsScreen } from './screens/core/PaymentAdjustmentsScreen';
import { NotificationsScreen } from './screens/core/NotificationsScreen';
import { CustomerLedgerScreen } from './screens/core/CustomerLedgerScreen';
import { Customer360Screen } from './screens/core/Customer360Screen';

// Masters Screens (21 - 28)
import { EntityMasterScreen } from './screens/masters/EntityMasterScreen';
import { BrandMasterScreen } from './screens/masters/BrandMasterScreen';
import { CategoryMasterScreen } from './screens/masters/CategoryMasterScreen';
import { ProductCatalogueScreen } from './screens/masters/ProductCatalogueScreen';
import { CustomerMasterScreen } from './screens/masters/CustomerMasterScreen';
import { ItemMasterScreen } from './screens/masters/ItemMasterScreen';
import { GroupProductScreen } from './screens/masters/GroupProductScreen';
import { ParametersScreen } from './screens/masters/ParametersScreen';
import { ChartOfAccountsScreen } from './screens/masters/ChartOfAccountsScreen';
import { TaxSlabMasterScreen } from './screens/masters/TaxSlabMasterScreen';
import { BrokerMasterScreen } from './screens/masters/BrokerMasterScreen';

// Reports Screens (29 - 35)
import { AnalyticsReportsScreen } from './screens/reports/AnalyticsReportsScreen';
import { SalesRegisterScreen } from './screens/reports/SalesRegisterScreen';
import { PurchaseRegisterScreen } from './screens/reports/PurchaseRegisterScreen';
import { TrialBalanceScreen } from './screens/reports/TrialBalanceScreen';
import { BalanceSheetScreen } from './screens/reports/BalanceSheetScreen';
import { ProfitAndLossScreen } from './screens/reports/ProfitAndLossScreen';
import { BankCashBookScreen } from './screens/reports/BankCashBookScreen';

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
    case 40:
      return <PurchaseOrderScreen />;
    case 41:
      return <DispatchScreen />;
    case 42:
      return <InvoiceScreen />;
    case 43:
      return <PaymentScreen />;
    case 45:
      return <PaymentAdjustmentsScreen />;
    case 46:
      return <NotificationsScreen />;
    case 13:
      return <BankReceiptVoucherScreen />;
    case 14:
      return <CashReceiptVoucherScreen />;
    case 15:
      return <PaymentVoucherScreen />;
    case 44:
      return <CustomerLedgerScreen />;
    case 48:
      return <Customer360Screen />;
    case 17:
      return <CreditDebitNoteScreen />;
    case 18:
      return <DebitNoteScreen />;
    case 19:
      return <MaterialReturnedScreen />;
    case 20:
      return <PaymentAdjustmentScreen />;

    // Masters
    case 36:
      return <EntityMasterScreen />;
    case 37:
      return <BrandMasterScreen />;
    case 38:
      return <CategoryMasterScreen />;
    case 39:
      return <ProductCatalogueScreen />;
    case 21:
      return <ItemMasterScreen />;
    case 22:
      return <GroupProductScreen />;
    case 23:
      return <CustomerMasterScreen />;
    case 25:
      return <ParametersScreen />;
    case 26:
      return <ChartOfAccountsScreen />;
    case 27:
      return <TaxSlabMasterScreen />;
    case 28:
      return <BrokerMasterScreen />;

    // Reports
    case 47:
      return <AnalyticsReportsScreen />;
    case 29:
      return <SalesRegisterScreen />;
    case 30:
      return <PurchaseRegisterScreen />;
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
  const { currentScreenId, setQuickJumpOpen } = useErp();

  // Screens 1 - 4 are dedicated full-page Auth Gates (Login, Operator Waiting, Verbal OTP, Admin PIN Setup)
  if (currentScreenId <= 4) {
    return (
      <div className="min-h-screen w-full relative select-none overflow-x-hidden bg-[var(--erp-base)] flex flex-col justify-center items-center">
        <ScreenDispatcher />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--erp-base)] text-[var(--erp-text)] flex flex-col font-sans antialiased select-none">
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
        <ToastContainer
          position="top-right"
          autoClose={4000}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          pauseOnHover
          draggable={false}
          className="ariav-toast-container"
          toastClassName="ariav-toast"
          aria-label="Notifications"
        />
        <ErpShell />
      </ErpProvider>
    </ThemeProvider>
  );
}
