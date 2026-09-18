import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { 
  ScreenDefinition, 
  ERP_SCREENS, 
  ALL_ENTITIES,
  ALL_ENTITIES_ID,
  Branch,
  parseSelectedEntityId,
  SelectedEntityId, 
  OperatorApprovalRequest, 
  AuditLogEntry, 
  PartyAccount, 
  TextileItem, 
  UserRole 
} from '../types/erp';
import { 
  INITIAL_PARTIES, 
  INITIAL_ITEMS, 
  INITIAL_AUDIT_LOGS 
} from '../data/erpData';
import { authApi, PythonHealthInfo } from '../services/authApi';
import { EntityRow, entitiesApi } from '../services/entitiesApi';
import { notifyError, notifyInfo, notifySuccess } from '../services/notify';

interface ErpContextType {
  currentScreenId: number;
  currentScreen: ScreenDefinition;
  setCurrentScreenId: (id: number) => void;
  navigateTo: (screenIdOrSlug: number | string) => void;
  
  // Header selectors — selectedEntityId is the app-wide entity scope ('all' or a numeric id)
  branches: Branch[];
  selectedBranch: Branch;
  selectedEntityId: SelectedEntityId;
  setSelectedBranch: (branch: Branch) => void;
  setSelectedEntityId: (id: SelectedEntityId) => void;
  financialYear: string;
  setFinancialYear: (fy: string) => void;
  
  // Security & Role — role is session-backed; setUserRole is login/OTP only
  userRole: UserRole;
  setUserRole: (role: UserRole) => void;
  sessionUserName: string;
  logout: () => void;

  // Python Backend API Status
  pythonStatus: PythonHealthInfo | null;
  pythonOnline: boolean;
  refreshPythonStatus: () => Promise<void>;
  
  // Live Approvals & Queue
  approvalQueue: OperatorApprovalRequest[];
  approvalQueueLoaded: boolean;
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

const SCREEN_STORAGE_KEY = 'ariav_current_screen';
const ENTITY_STORAGE_KEY = 'ariav_selected_entity_id';

function mapEntityToBranch(row: EntityRow): Branch {
  return {
    id: String(row.id),
    name: row.entity_name,
    code: row.short_code,
    city: row.city,
    address: [row.address_line_1, row.street, row.area].filter(Boolean).join(', '),
    phone: row.phone || row.mobile,
    gstin: row.gst_no,
    isHeadOffice: row.entity_type === 'Head Office',
  };
}

function restoreSelectedBranch(list: Branch[], stored: string | null): Branch {
  const parsed = parseSelectedEntityId(stored);
  if (parsed === ALL_ENTITIES_ID) return ALL_ENTITIES;
  return list.find(b => b.id === String(parsed)) || ALL_ENTITIES;
}

function readStoredScreen(): number {
  try {
    const saved = Number(sessionStorage.getItem(SCREEN_STORAGE_KEY) || '');
    if (saved === 24) return 36;
    if (saved === 12) return 42;
    if (saved === 16 || saved === 31) return 44;
    if (saved > 4 && ERP_SCREENS.some(s => s.id === saved)) return saved;
    return 6;
  } catch {
    return 6;
  }
}

export const ErpProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const hasStoredToken = typeof window !== 'undefined' && !!localStorage.getItem('ariav_auth_token');
  const [currentScreenId, setCurrentScreenId] = useState<number>(() =>
    hasStoredToken ? readStoredScreen() : 1
  );
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranchState] = useState<Branch>(() =>
    restoreSelectedBranch([], localStorage.getItem(ENTITY_STORAGE_KEY))
  );
  const [financialYear, setFinancialYear] = useState<string>('2025-26');
  const [userRole, setUserRole] = useState<UserRole>(() => {
    if (!localStorage.getItem('ariav_auth_token')) return 'operator';
    return localStorage.getItem('ariav_auth_role') === 'admin' ? 'admin' : 'operator';
  });
  const [sessionUserName, setSessionUserName] = useState<string>(
    () => localStorage.getItem('ariav_auth_name') || ''
  );

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

  useEffect(() => {
    if (currentScreenId === 12) setCurrentScreenId(42);
    if (currentScreenId === 16 || currentScreenId === 31) setCurrentScreenId(44);
  }, [currentScreenId]);

  useEffect(() => {
    if (currentScreenId > 4) {
      try {
        sessionStorage.setItem(SCREEN_STORAGE_KEY, String(currentScreenId));
      } catch {
        // storage quota
      }
    }
  }, [currentScreenId]);

  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      const token = localStorage.getItem('ariav_auth_token');
      if (!token) {
        if (!cancelled) setCurrentScreenId(1);
        return;
      }
      const me = await authApi.me();
      if (cancelled) return;
      if (me.success && (me.role === 'admin' || me.role === 'operator')) {
        setUserRole(me.role);
        localStorage.setItem('ariav_auth_role', me.role);
        const name = me.user?.name || '';
        if (name) {
          setSessionUserName(name);
          localStorage.setItem('ariav_auth_name', name);
        }
        setCurrentScreenId((prev) => (prev > 4 ? prev : readStoredScreen()));
      } else if (me.error === 'unavailable') {
        return;
      } else {
        localStorage.removeItem('ariav_auth_token');
        localStorage.removeItem('ariav_auth_role');
        localStorage.removeItem('ariav_auth_name');
        sessionStorage.removeItem(SCREEN_STORAGE_KEY);
        setCurrentScreenId(1);
      }
    };
    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const authenticated = currentScreenId > 4;
  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    const loadEntities = async () => {
      try {
        const rows = await entitiesApi.list({ status: 'Active' });
        const live = rows.map(mapEntityToBranch);
        if (cancelled || !live.length) return;
        setBranches(live);
        setSelectedBranchState(restoreSelectedBranch(live, localStorage.getItem(ENTITY_STORAGE_KEY)));
      } catch {
        // Keep current list if Entity Master cannot be fetched.
      }
    };
    void loadEntities();
    return () => {
      cancelled = true;
    };
  }, [authenticated, currentScreenId]);

  const setSelectedBranch = useCallback((branch: Branch) => {
    setSelectedBranchState(branch);
    localStorage.setItem(ENTITY_STORAGE_KEY, branch.id || ALL_ENTITIES_ID);
  }, []);

  const selectedEntityId: SelectedEntityId = parseSelectedEntityId(selectedBranch.id);

  const setSelectedEntityId = useCallback((id: SelectedEntityId) => {
    if (id === ALL_ENTITIES_ID) {
      setSelectedBranch(ALL_ENTITIES);
      return;
    }
    const found = branches.find(b => b.id === String(id));
    setSelectedBranch(found || ALL_ENTITIES);
  }, [branches, setSelectedBranch]);
  
  const [approvalQueue, setApprovalQueue] = useState<OperatorApprovalRequest[]>([]);
  const [approvalQueueLoaded, setApprovalQueueLoaded] = useState(false);
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

  // Fetch live operator login approvals
  const refreshApprovalQueue = useCallback(async () => {
    try {
      const res = await authApi.getAdminQueue();
      if (res.success && Array.isArray(res.queue)) {
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
      // Keep last successful snapshot; do not restore mock rows
    } finally {
      setApprovalQueueLoaded(true);
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

  const commitUserRole = useCallback((role: UserRole) => {
    setUserRole(role);
    localStorage.setItem('ariav_auth_role', role);
    setSessionUserName(localStorage.getItem('ariav_auth_name') || '');
  }, []);

  const currentScreen = ERP_SCREENS.find(s => s.id === currentScreenId) || ERP_SCREENS[5];

  const navigateTo = (screenIdOrSlug: number | string) => {
    if (typeof screenIdOrSlug === 'number') {
      setCurrentScreenId(screenIdOrSlug === 24 ? 36 : screenIdOrSlug);
    } else {
      const found = ERP_SCREENS.find(s => s.slug === screenIdOrSlug);
      if (found) setCurrentScreenId(found.id);
    }
  };

  const showFlash = (text: string, type: 'positive' | 'negative' | 'gold' = 'positive') => {
    if (type === 'negative') notifyError(text);
    else if (type === 'gold') notifyInfo(text);
    else notifySuccess(text);
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
      user: sessionUserName
        ? `${sessionUserName} (${userRole === 'admin' ? 'Admin' : 'Operator'})`
        : userRole === 'admin'
          ? 'Admin'
          : 'Operator',
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
    addAuditLog('User Session Terminated', 'Security Gateway', `Terminal session locked by ${sessionUserName || userRole}`, 'notice');
    showFlash('Logged out successfully. Terminal locked.', 'gold');
    setPendingLoginRequest(null);
    void authApi.logout();
    setSessionUserName('');
    setUserRole('operator');
    setCurrentScreenId(1);
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
        selectedEntityId,
        setSelectedBranch,
        setSelectedEntityId,
        financialYear,
        setFinancialYear,
        userRole,
        setUserRole: commitUserRole,
        sessionUserName,
        logout,
        pythonStatus,
        pythonOnline,
        refreshPythonStatus,
        approvalQueue,
        approvalQueueLoaded,
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

