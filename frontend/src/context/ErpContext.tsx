import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { 
  ScreenDefinition, 
  ERP_SCREENS, 
  Branch, 
  OperatorApprovalRequest, 
  AuditLogEntry, 
  PartyAccount, 
  TextileItem, 
  UserRole 
} from '../types/erp';
import { 
  INITIAL_BRANCHES, 
  INITIAL_PARTIES, 
  INITIAL_ITEMS, 
  INITIAL_APPROVAL_REQUESTS, 
  INITIAL_AUDIT_LOGS 
} from '../data/erpData';
import { authApi, PythonHealthInfo } from '../services/authApi';

interface ErpContextType {
  currentScreenId: number;
  currentScreen: ScreenDefinition;
  setCurrentScreenId: (id: number) => void;
  navigateTo: (screenIdOrSlug: number | string) => void;
  
  // Header selectors
  branches: Branch[];
  selectedBranch: Branch;
  setSelectedBranch: (branch: Branch) => void;
  financialYear: string;
  setFinancialYear: (fy: string) => void;
  
  // Security & Role
  userRole: UserRole;
  setUserRole: (role: UserRole) => void;
  logout: () => void;

  // Python Backend API Status
  pythonStatus: PythonHealthInfo | null;
  pythonOnline: boolean;
  refreshPythonStatus: () => Promise<void>;
  
  // Live Approvals & Queue
  approvalQueue: OperatorApprovalRequest[];
  refreshApprovalQueue: () => Promise<void>;
  approveRequest: (id: string) => Promise<string>;
  rejectRequest: (id: string) => Promise<void>;
  requestOperatorApproval: (action: string) => Promise<OperatorApprovalRequest>;

  // Pending Staff Operator Login Request
  pendingLoginRequest: {
    id: string;
    operatorName: string;
    operatorCode: string;
    branch: string;
    adminName: string;
    status: 'pending' | 'approved' | 'rejected';
  } | null;
  setPendingLoginRequest: React.Dispatch<React.SetStateAction<{
    id: string;
    operatorName: string;
    operatorCode: string;
    branch: string;
    adminName: string;
    status: 'pending' | 'approved' | 'rejected';
  } | null>>;
  
  // Audit Logs
  auditLogs: AuditLogEntry[];
  addAuditLog: (action: string, module: string, details: string, severity?: 'info' | 'notice' | 'critical') => void;
  
  // Shared Masters
  parties: PartyAccount[];
  items: TextileItem[];
  addParty: (party: PartyAccount) => void;
  addItem: (item: TextileItem) => void;
  
  // Quick Jump Modal
  quickJumpOpen: boolean;
  setQuickJumpOpen: (open: boolean) => void;
  
  // Live Clock
  liveClock: string;

  // Global Notification Flash
  flashMessage: { text: string; type: 'positive' | 'negative' | 'gold' } | null;
  showFlash: (text: string, type?: 'positive' | 'negative' | 'gold') => void;
  clearFlash: () => void;
}

const ErpContext = createContext<ErpContextType | undefined>(undefined);

export const ErpProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentScreenId, setCurrentScreenId] = useState<number>(1); // Start on Login Gateway (screen 1)
  const [branches] = useState<Branch[]>(INITIAL_BRANCHES);
  const [selectedBranch, setSelectedBranch] = useState<Branch>(INITIAL_BRANCHES[0]);
  const [financialYear, setFinancialYear] = useState<string>('2025-26');
  const [userRole, setUserRole] = useState<UserRole>('admin');

  const [pendingLoginRequest, setPendingLoginRequest] = useState<{
    id: string;
    operatorName: string;
    operatorCode: string;
    branch: string;
    adminName: string;
    status: 'pending' | 'approved' | 'rejected';
  } | null>(() => {
    try {
      const saved = sessionStorage.getItem('ariav_pending_login_req');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      if (pendingLoginRequest) {
        sessionStorage.setItem('ariav_pending_login_req', JSON.stringify(pendingLoginRequest));
      } else {
        sessionStorage.removeItem('ariav_pending_login_req');
      }
    } catch {
      // storage quota
    }
  }, [pendingLoginRequest]);
  
  const [approvalQueue, setApprovalQueue] = useState<OperatorApprovalRequest[]>(INITIAL_APPROVAL_REQUESTS);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(INITIAL_AUDIT_LOGS);
  const [parties, setParties] = useState<PartyAccount[]>(INITIAL_PARTIES);
  const [items, setItems] = useState<TextileItem[]>(INITIAL_ITEMS);
  const [quickJumpOpen, setQuickJumpOpen] = useState<boolean>(false);
  const [flashMessage, setFlashMessage] = useState<{ text: string; type: 'positive' | 'negative' | 'gold' } | null>(null);

  // Python Backend status
  const [pythonStatus, setPythonStatus] = useState<PythonHealthInfo | null>(null);
  const [pythonOnline, setPythonOnline] = useState<boolean>(false);

  const refreshPythonStatus = useCallback(async () => {
    const health = await authApi.getHealth();
    if (health) {
      setPythonStatus(health);
      setPythonOnline(true);
    } else {
      setPythonOnline(false);
    }
  }, []);

  // Fetch live approvals from Python SQLite backend
  const refreshApprovalQueue = useCallback(async () => {
    try {
      const res = await authApi.getAdminQueue();
      if (res.success && res.queue && res.queue.length > 0) {
        const mapped: OperatorApprovalRequest[] = res.queue.map(q => ({
          id: q.id,
          operatorName: q.operator_name,
          operatorCode: q.operator_code,
          branch: q.branch,
          terminalIp: q.terminal_ip,
          actionRequested: q.action_requested,
          timestamp: q.timestamp,
          status: (q.status as any) || 'pending',
          verbalOtp: q.verbal_otp,
          expiresInSeconds: q.seconds_remaining ?? 300,
        }));
        setApprovalQueue(mapped);
      }
    } catch {
      // Keep local state fallback
    }
  }, []);

  // Periodic polling for health & queue
  useEffect(() => {
    refreshPythonStatus();
    refreshApprovalQueue();
    const interval = setInterval(() => {
      refreshPythonStatus();
      refreshApprovalQueue();
    }, 4000);
    return () => clearInterval(interval);
  }, [refreshPythonStatus, refreshApprovalQueue]);

  // Live real-time clock
  const [liveClock, setLiveClock] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-IN', {
        hour12: true,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      setLiveClock(`${timeStr} IST`);
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Keyboard shortcut: Cmd/Ctrl + K or Escape for Quick Jump (authenticated sessions only)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (!userRole) return;
        e.preventDefault();
        setQuickJumpOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setQuickJumpOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [userRole]);

  const currentScreen = ERP_SCREENS.find(s => s.id === currentScreenId) || ERP_SCREENS[5];

  const navigateTo = (screenIdOrSlug: number | string) => {
    if (typeof screenIdOrSlug === 'number') {
      setCurrentScreenId(screenIdOrSlug);
    } else {
      const found = ERP_SCREENS.find(s => s.slug === screenIdOrSlug);
      if (found) setCurrentScreenId(found.id);
    }
  };

  const showFlash = (text: string, type: 'positive' | 'negative' | 'gold' = 'positive') => {
    setFlashMessage({ text, type });
    setTimeout(() => {
      setFlashMessage(null);
    }, 4500);
  };

  const addAuditLog = (
    action: string, 
    module: string, 
    details: string, 
    severity: 'info' | 'notice' | 'critical' = 'info'
  ) => {
    const now = new Date();
    const dateStr = now.toISOString().replace('T', ' ').substring(0, 19);
    const newEntry: AuditLogEntry = {
      id: `AUD-${Math.floor(1000 + Math.random() * 9000)}`,
      timestamp: dateStr,
      user: userRole === 'admin' ? 'Paresh Patel (Admin)' : 'Bhavin Joshi (OP-04)',
      role: userRole === 'admin' ? 'Managing Partner' : 'Branch Accountant',
      action,
      module,
      ipAddress: userRole === 'admin' ? '10.0.4.11' : '192.168.10.42',
      details,
      severity
    };
    setAuditLogs(prev => [newEntry, ...prev]);
  };

  const approveRequest = async (id: string): Promise<string> => {
    let generatedOtp = `${Math.floor(100 + Math.random() * 900)}-${Math.floor(100 + Math.random() * 900)}`;
    
    // Call Python backend
    try {
      const res = await authApi.approveRequest(id);
      if (res.success && res.verbalOtp) {
        generatedOtp = res.verbalOtp;
      }
    } catch {
      // fallback to generatedOtp
    }

    setApprovalQueue(prev =>
      prev.map(req => {
        if (req.id === id) {
          return {
            ...req,
            status: 'approved',
            verbalOtp: generatedOtp,
            expiresInSeconds: 300
          };
        }
        return req;
      })
    );
    addAuditLog('Admin approved operator request', 'Security Gate', `Generated Verbal OTP [${generatedOtp}] for request ${id} via Python Backend`, 'notice');
    showFlash(`Request ${id} approved. Verbal OTP generated: ${generatedOtp}`, 'positive');
    return generatedOtp;
  };

  const rejectRequest = async (id: string) => {
    try {
      await authApi.rejectRequest(id);
    } catch {
      // proceed
    }

    setApprovalQueue(prev =>
      prev.map(req => {
        if (req.id === id) {
          return { ...req, status: 'rejected' };
        }
        return req;
      })
    );
    addAuditLog('Admin rejected operator request', 'Security Gate', `Request ${id} rejected by terminal administrator via Python Backend`, 'critical');
    showFlash(`Request ${id} rejected`, 'negative');
  };

  const requestOperatorApproval = async (action: string): Promise<OperatorApprovalRequest> => {
    let newReq: OperatorApprovalRequest = {
      id: `REQ-${Math.floor(900 + Math.random() * 99)}`,
      operatorName: 'Bhavin V. Joshi',
      operatorCode: 'OP-04',
      branch: selectedBranch.name,
      terminalIp: '192.168.10.42',
      actionRequested: action,
      timestamp: new Date().toLocaleTimeString('en-IN', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      status: 'pending',
      expiresInSeconds: 300
    };

    try {
      const res = await authApi.requestOperator({
        operatorCode: newReq.operatorCode,
        operatorName: newReq.operatorName,
        branch: newReq.branch,
        actionRequested: action,
        terminalIp: newReq.terminalIp
      });
      if (res.success && res.request) {
        newReq = {
          ...newReq,
          id: res.request.id,
          timestamp: res.request.timestamp,
          status: 'pending',
        };
      }
    } catch {
      // local fallback
    }

    setApprovalQueue(prev => [newReq, ...prev]);
    addAuditLog('Operator initiated authorization request', 'Security Gate', `${action} queued in Python Auth API`, 'notice');
    showFlash(`Authorization request dispatched to Python Auth backend`, 'gold');
    return newReq;
  };

  const addParty = (party: PartyAccount) => {
    setParties(prev => [party, ...prev]);
    addAuditLog('Created new Party Account', 'Account Master', `Party: ${party.name} (${party.code})`, 'info');
    showFlash(`Party ${party.name} registered successfully`, 'positive');
  };

  const addItem = (item: TextileItem) => {
    setItems(prev => [item, ...prev]);
    addAuditLog('Created new Textile Item', 'Item Master', `SKU: ${item.sku} - ${item.description}`, 'info');
    showFlash(`Item ${item.sku} saved to catalogue`, 'positive');
  };

  const logout = () => {
    addAuditLog('User Session Terminated', 'Security Gateway', `Terminal session locked by ${userRole === 'admin' ? 'Paresh Patel (Admin)' : 'Bhavin Joshi (Operator)'}`, 'notice');
    showFlash('Logged out successfully. Terminal locked.', 'gold');
    setPendingLoginRequest(null);
    setCurrentScreenId(1); // Return to Screen 1: Login Gateway
  };

  return (
    <ErpContext.Provider
      value={{
        currentScreenId,
        currentScreen,
        setCurrentScreenId,
        navigateTo,
        branches,
        selectedBranch,
        setSelectedBranch,
        financialYear,
        setFinancialYear,
        userRole,
        setUserRole,
        logout,
        pythonStatus,
        pythonOnline,
        refreshPythonStatus,
        approvalQueue,
        refreshApprovalQueue,
        approveRequest,
        rejectRequest,
        requestOperatorApproval,
        pendingLoginRequest,
        setPendingLoginRequest,
        auditLogs,
        addAuditLog,
        parties,
        items,
        addParty,
        addItem,
        quickJumpOpen,
        setQuickJumpOpen,
        liveClock,
        flashMessage,
        showFlash,
        clearFlash: () => setFlashMessage(null),
      }}
    >
      {children}
    </ErpContext.Provider>
  );
};

export const useErp = (): ErpContextType => {
  const context = useContext(ErpContext);
  if (!context) {
    throw new Error('useErp must be used within an ErpProvider');
  }
  return context;
};

