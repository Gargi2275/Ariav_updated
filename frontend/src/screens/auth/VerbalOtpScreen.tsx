import React, { useEffect, useRef, useState } from 'react';
import { useErp } from '../../context/ErpContext';
import { LockKeyhole, Clock, AlertTriangle, ArrowRight, CheckCircle2, ArrowLeft, Loader2 } from 'lucide-react';
import { authApi } from '../../services/authApi';

export const VerbalOtpScreen: React.FC = () => {
  const { navigateTo, setUserRole, showFlash, addAuditLog, pendingLoginRequest, setPendingLoginRequest } = useErp();
  const deadlineRef = useRef(pendingLoginRequest?.expiresAt || 0);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(() => {
    if (!pendingLoginRequest?.expiresAt) return null;
    return Math.max(0, Math.ceil((pendingLoginRequest.expiresAt - Date.now()) / 1000));
  });
  const [otpCode, setOtpCode] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const operatorName = pendingLoginRequest?.operatorName || '';
  const branchName = pendingLoginRequest?.branch === 'Surat Ring Road Textile Mkt' ? '' : (pendingLoginRequest?.branch || '');
  const timedOut = secondsRemaining === 0;

  useEffect(() => {
    const requestId = pendingLoginRequest?.id;
    if (!requestId) {
      setSecondsRemaining(0);
      setErrorMessage('No login request found for this terminal. Go back and sign in again.');
      return;
    }
    let cancelled = false;
    void authApi.checkRequestStatus(requestId).then(res => {
      if (cancelled) return;
      const closed = !res.success || res.status === 'expired' || res.status === 'rejected' || res.status === 'completed' || res.status === 'not_found';
      if (closed) {
        deadlineRef.current = Date.now();
        setSecondsRemaining(0);
        setErrorMessage('This code has expired. Sign in again and ask for a new approval.');
        return;
      }
      const left = Math.max(0, res.seconds_remaining ?? 0);
      deadlineRef.current = Date.now() + left * 1000;
      setPendingLoginRequest(current => current ? { ...current, expiresAt: deadlineRef.current } : current);
      setSecondsRemaining(left);
    }).catch(() => {
      if (cancelled || deadlineRef.current) return;
      setSecondsRemaining(0);
      setErrorMessage('Could not confirm how long this code remains valid. Sign in again.');
    });
    return () => { cancelled = true; };
  }, [pendingLoginRequest?.id, setPendingLoginRequest]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!deadlineRef.current) return;
      setSecondsRemaining(Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (secondsRemaining === null || secondsRemaining <= 0) {
      setErrorMessage('This code has expired. Sign in again and ask for a new approval.');
      return;
    }

    const cleaned = otpCode.replace(/[^0-9]/g, '');
    if (cleaned.length !== 6) {
      setErrorMessage('Enter the 6-digit code from your administrator.');
      return;
    }

    const requestId = pendingLoginRequest?.id;
    if (!requestId) {
      setErrorMessage('No login request found for this terminal. Go back and sign in again.');
      return;
    }

    setIsValidating(true);
    setErrorMessage('');

    try {
      const res = await authApi.verifyVerbalOtp(requestId, cleaned);
      if (res.success) {
        setIsVerified(true);
        setUserRole('staff');
        setPendingLoginRequest(null);
        addAuditLog('Verbal OTP Successfully Cleared', 'Security Gate', `Operator session opened for request ${requestId}`, 'notice');
        showFlash(res.message || 'Verbal OTP validated. Operator session active.', 'positive');
        setTimeout(() => {
          navigateTo(6); // Only now reach /dashboard
        }, 1200);
      } else {
        // Block access on failure
        setErrorMessage(res.error || 'Invalid verbal OTP. Please check the 6-digit code with your administrator.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Verification failed. Please check the code with the administrator.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleCancel = () => {
    setPendingLoginRequest(null);
    showFlash('Sign in again when you are ready.', 'gold');
    navigateTo(1); // Return to Login Gateway
  };

  return (
    <div className="max-w-md w-full mx-auto p-4 flex flex-col justify-center my-auto">
      <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-8 shadow-2xl relative text-left">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 mb-6 border-b border-[var(--erp-hairline)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[var(--erp-surface-2)] border border-[var(--erp-gold)] flex items-center justify-center text-[var(--erp-gold)]">
              <LockKeyhole className="w-5 h-5" />
            </div>
            <div>
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--erp-gold)] font-medium">SIGN IN</span>
              <h2 className="font-serif text-lg font-bold text-[var(--erp-text)]">
                {timedOut ? 'This code has timed out' : 'Enter your code'}
              </h2>
            </div>
          </div>

          {/* 5-minute countdown */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] font-mono text-xs">
            <Clock className={`w-3.5 h-3.5 ${secondsRemaining !== null && secondsRemaining < 60 ? 'text-[var(--erp-negative)] animate-pulse' : 'text-[var(--erp-gold)]'}`} />
            <span className={secondsRemaining !== null && secondsRemaining < 60 ? 'text-[var(--erp-negative)] font-bold' : 'text-[var(--erp-text)]'}>
              {secondsRemaining === null ? '--:--' : timedOut ? 'Timed out' : formatTime(secondsRemaining)}
            </span>
          </div>
        </div>

        {/* Requester Identity Confirmation */}
        <div className="mb-5 py-2.5 px-4 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-xs font-mono text-[var(--erp-text)] flex flex-col sm:flex-row items-center justify-between gap-1 text-center sm:text-left">
          <span className="font-semibold text-[var(--erp-text)]">{operatorName}</span>
          {branchName ? <span className="text-[var(--erp-muted)]">{branchName}</span> : null}
        </div>

        {!isVerified && timedOut ? (
          <div className="space-y-5">
            <p className="text-sm text-[var(--erp-muted)] leading-relaxed font-sans">
              This sign-in code is no longer valid. Sign in again, then ask your administrator for a new code.
            </p>
            <button
              type="button"
              onClick={handleCancel}
              className="w-full py-2.5 bg-[var(--erp-gold)] text-[#0F141B] font-mono text-xs font-semibold hover:bg-[var(--erp-gold-soft)] transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" /> Sign in again
            </button>
          </div>
        ) : !isVerified ? (
          <form onSubmit={handleVerify} className="space-y-5">
            <p className="text-sm text-[var(--erp-muted)] leading-relaxed font-sans">
              Ask your administrator for the 6-digit code. The time left stays the same if you refresh this page.
            </p>

            <div>
              <label className="block text-xs font-mono text-[var(--erp-muted)] mb-1.5">
                Security code
              </label>
              <input
                type="text"
                autoFocus
                placeholder="6-digit code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                value={otpCode}
                onChange={e => {
                  setOtpCode(e.target.value);
                  setErrorMessage('');
                }}
                disabled={isValidating}
                className="w-full px-4 py-3 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline-strong)] font-mono text-center tracking-[0.3em] text-2xl text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none placeholder:text-[var(--erp-faint)] placeholder:text-sm placeholder:tracking-normal transition-colors"
              />
              {errorMessage && (
                <div className="flex items-start gap-1.5 text-xs font-mono text-[var(--erp-negative)] mt-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="submit"
                disabled={isValidating || !otpCode.trim() || secondsRemaining === null || secondsRemaining <= 0}
                className="flex-1 py-2.5 bg-[var(--erp-gold)] text-[#0F141B] font-mono text-xs font-semibold hover:bg-[var(--erp-gold-soft)] disabled:opacity-50 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                {isValidating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Verifying...
                  </>
                ) : (
                  <>
                    Validate & Enter <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleCancel}
                className="px-3 py-2.5 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface-2)] text-xs font-mono text-[var(--erp-muted)] hover:text-[var(--erp-text)] hover:border-[var(--erp-hairline)] transition-colors flex items-center gap-1 cursor-pointer"
                title="Cancel and return to login"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="py-6 flex flex-col items-center justify-center gap-3 text-center animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 bg-[var(--erp-positive)]/20 border-2 border-[var(--erp-positive)] flex items-center justify-center text-[var(--erp-positive)]">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h3 className="font-serif text-lg font-bold text-[var(--erp-text)]">
              Session Authenticated
            </h3>
            <p className="text-xs font-mono text-[var(--erp-positive)]">
              Signed in{branchName ? ` for ${branchName}` : ''}.
            </p>
            <span className="text-[11px] font-mono text-[var(--erp-muted)]">
              Entering dashboard...
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
