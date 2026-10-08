import React, { useState } from 'react';
import { useErp } from '../../context/ErpContext';
import { KeyRound, ShieldCheck, Terminal, Loader2 } from 'lucide-react';
import { authApi } from '../../services/authApi';

const PIN_PATTERN = /^\d{6}$/;

const pinInputClass =
  'w-full px-3 py-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline-strong)] font-mono text-center tracking-[0.5em] text-lg text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none';

export const AdminPinSetupScreen: React.FC = () => {
  const { navigateTo, showFlash, addAuditLog, userRole } = useErp();
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const isAdminSession = userRole === 'admin' && !!localStorage.getItem('ariav_auth_token');

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!PIN_PATTERN.test(currentPin)) {
      setError('Enter your current 6-digit PIN.');
      return;
    }
    if (!PIN_PATTERN.test(newPin)) {
      setError('New PIN must be exactly 6 digits.');
      return;
    }
    if (newPin !== confirmPin) {
      setError('New PINs do not match.');
      return;
    }
    if (newPin === currentPin) {
      setError('New PIN must be different from the current PIN.');
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const res = await authApi.changePin(currentPin, newPin);
      if (res.success) {
        setCurrentPin('');
        setNewPin('');
        setConfirmPin('');
        addAuditLog('Admin Master PIN changed', 'Security Gate', 'PIN changed; other admin sessions signed out', 'critical');
        showFlash(res.message || 'PIN changed. Other sessions for this account were signed out.', 'positive');
      } else {
        setError(res.error || 'PIN change failed.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-6 flex flex-col gap-6 text-left my-auto">
      <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-6 relative">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[var(--erp-hairline)]">
          <div className="w-10 h-10 bg-[var(--erp-surface-2)] border border-[var(--erp-gold)] flex items-center justify-center text-[var(--erp-gold)]">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <span className="font-mono text-xs text-[var(--erp-gold)]">CREDENTIAL MANAGEMENT</span>
            <h2 className="font-serif text-xl font-bold text-[var(--erp-text)]">
              {isAdminSession ? 'Change Admin PIN' : 'Admin PIN Recovery'}
            </h2>
          </div>
        </div>

        {isAdminSession ? (
          <form onSubmit={handleChangePin} className="space-y-4">
            <div>
              <label className="block text-xs font-normal text-[var(--erp-muted)] mb-1">
                Current PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                maxLength={6}
                autoFocus
                value={currentPin}
                onChange={e => { setCurrentPin(e.target.value.replace(/\D/g, '')); setError(''); }}
                placeholder="••••••"
                className={pinInputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-normal text-[var(--erp-muted)] mb-1">
                New PIN (6 digits)
              </label>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={6}
                value={newPin}
                onChange={e => { setNewPin(e.target.value.replace(/\D/g, '')); setError(''); }}
                placeholder="••••••"
                className={pinInputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-normal text-[var(--erp-muted)] mb-1">
                Confirm New PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={6}
                value={confirmPin}
                onChange={e => { setConfirmPin(e.target.value.replace(/\D/g, '')); setError(''); }}
                placeholder="••••••"
                className={pinInputClass}
              />
              {error && <p className="text-xs font-mono text-[var(--erp-negative)] mt-1">{error}</p>}
            </div>

            <p className="text-xs text-[var(--erp-muted)]">
              Changing the PIN signs out every other session for this admin account.
            </p>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 bg-[var(--erp-positive)] text-white font-mono text-xs font-semibold hover:bg-[#2c8d6e] disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Change PIN
            </button>
          </form>
        ) : (
          <div className="space-y-4 text-xs text-[var(--erp-muted)]">
            <p>
              A forgotten admin PIN cannot be reset from the browser. Ask the server administrator to run
              this command on the application server:
            </p>
            <div className="flex items-center gap-2 px-3 py-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] font-mono text-[var(--erp-text)]">
              <Terminal className="w-4 h-4 text-[var(--erp-gold)] shrink-0" />
              <span>python manage.py reset_admin_pin &lt;username&gt;</span>
            </div>
            <p>
              The command prompts for the new PIN without echoing it, signs out every session for that admin
              and records the reset in the audit trail. After the reset, sign in with password and the new PIN.
            </p>
          </div>
        )}
      </div>

      <div className="flex justify-between items-center text-xs font-mono text-[var(--erp-muted)]">
        <button onClick={() => navigateTo(isAdminSession ? 6 : 1)} className="hover:text-[var(--erp-text)]">
          ← {isAdminSession ? 'Back to Dashboard' : 'Return to Login Gate'}
        </button>
      </div>
    </div>
  );
};
