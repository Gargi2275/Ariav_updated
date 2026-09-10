import React, { useState, useEffect } from 'react';
import { useErp } from '../../context/ErpContext';
import { X, CheckCircle2, ArrowRight, AlertCircle, ArrowLeft } from 'lucide-react';
import { authApi } from '../../services/authApi';

export const OperatorWaitingScreen: React.FC = () => {
  const { pendingLoginRequest, setPendingLoginRequest, approvalQueue, navigateTo, showFlash } = useErp();
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');

  // Identify active request info
  const targetReqId = pendingLoginRequest?.id || approvalQueue.find(r => r.status === 'pending')?.id || '';
  const operatorName = pendingLoginRequest?.operatorName || 'Bhavin V. Joshi';
  const branchName = pendingLoginRequest?.branch || 'Surat Ring Road Textile Mkt';
  const adminName = pendingLoginRequest?.adminName || 'admin';

  // Poll /api/check-request-status/ every 4 seconds
  useEffect(() => {
    if (status !== 'pending') return;

    const pollStatus = async () => {
      if (!targetReqId) {
        // If no request ID found, check in-memory queue
        const match = approvalQueue.find(r => r.operatorName === operatorName);
        if (match?.status === 'approved') {
          setStatus('approved');
          showFlash('Request approved. Please enter the 6-digit verbal OTP from admin.', 'positive');
          setTimeout(() => {
            navigateTo(3); // Screen 3: Verbal OTP Gate
          }, 800);
        } else if (match?.status === 'rejected') {
          setStatus('rejected');
        }
        return;
      }

      try {
        const res = await authApi.checkRequestStatus(targetReqId);
        if (res.success && res.status) {
          if (res.status === 'approved') {
            setStatus('approved');
            showFlash('Request approved. Please enter the 6-digit verbal OTP from admin.', 'positive');
            setTimeout(() => {
              navigateTo(3); // Screen 3: Verbal OTP Gate
            }, 800);
          } else if (res.status === 'rejected') {
            setStatus('rejected');
            showFlash('Login request declined by administrator.', 'negative');
          }
        }
      } catch {
        // Quiet poll retry
      }
    };

    // Immediate check on mount
    pollStatus();

    // 4-second poll interval
    const interval = setInterval(pollStatus, 4000);
    return () => clearInterval(interval);
  }, [targetReqId, status, approvalQueue, operatorName, navigateTo, showFlash]);

  const handleCancel = () => {
    setPendingLoginRequest(null);
    showFlash('Login request canceled.', 'gold');
    navigateTo(1); // Return to Screen 1: Login Gateway
  };

  return (
    <div className="max-w-md w-full mx-auto p-4 flex flex-col justify-center my-auto">
      <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-8 shadow-2xl text-center">
        {status === 'pending' && (
          <>
            {/* Calm Loading Indicator */}
            <div className="flex justify-center mb-6">
              <div className="relative w-12 h-12 flex items-center justify-center">
                <span className="w-10 h-10 rounded-full bg-[var(--erp-gold)]/15 animate-ping absolute" />
                <span className="w-3.5 h-3.5 rounded-full bg-[var(--erp-gold)] shadow-sm" />
              </div>
            </div>

            {/* Title */}
            <h2 className="font-serif text-2xl font-bold text-[var(--erp-text)] mb-2">
              Waiting for approval
            </h2>

            {/* Human Message */}
            <p className="text-sm text-[var(--erp-muted)] leading-relaxed mb-6">
              Your login request has been sent to admin. This usually takes a moment.
            </p>

            {/* Requester Identity (Plain & Human) - Full Text, No Truncation */}
            <div className="w-full py-3 px-4 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-xs font-mono text-[var(--erp-text)] mb-8 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-center rounded-xs">
              <span className="font-semibold text-[var(--erp-text)] whitespace-normal">{operatorName}</span>
              <span className="hidden sm:inline text-[var(--erp-hairline-strong)]">·</span>
              <span className="text-[var(--erp-muted)] whitespace-normal">{branchName}</span>
            </div>

            {/* Simple Cancel Request Action */}
            <div>
              <button
                type="button"
                onClick={handleCancel}
                className="text-xs font-mono text-[var(--erp-muted)] hover:text-[var(--erp-negative)] transition-colors inline-flex items-center gap-1.5 cursor-pointer underline-offset-4 hover:underline"
              >
                <X className="w-3.5 h-3.5" /> Cancel request
              </button>
            </div>
          </>
        )}

        {status === 'approved' && (
          <div className="space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-14 h-14 rounded-full bg-[var(--erp-positive)]/15 border border-[var(--erp-positive)]/40 flex items-center justify-center text-[var(--erp-positive)] mx-auto shadow-sm">
              <CheckCircle2 className="w-7 h-7" />
            </div>

            <div className="space-y-1.5">
              <h2 className="font-serif text-2xl font-bold text-[var(--erp-text)]">
                Request Approved
              </h2>
              <p className="text-xs text-[var(--erp-muted)] leading-relaxed">
                The administrator has authorized your request. Please enter the 6-digit verbal OTP provided by the admin.
              </p>
            </div>

            <button
              type="button"
              onClick={() => navigateTo(3)} // Screen 3: Verbal OTP Screen
              className="w-full py-3 bg-[var(--erp-gold)] text-[#0F141B] font-mono text-xs font-semibold hover:bg-[var(--erp-gold-soft)] transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            >
              Enter Verbal OTP <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {status === 'rejected' && (
          <div className="space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-14 h-14 rounded-full bg-[var(--erp-negative)]/15 border border-[var(--erp-negative)]/40 flex items-center justify-center text-[var(--erp-negative)] mx-auto shadow-sm">
              <AlertCircle className="w-7 h-7" />
            </div>

            <div className="space-y-1.5">
              <h2 className="font-serif text-2xl font-bold text-[var(--erp-negative)]">
                Request Declined
              </h2>
              <p className="text-xs text-[var(--erp-muted)] leading-relaxed">
                Your login request was declined by the administrator.
              </p>
            </div>

            <button
              type="button"
              onClick={handleCancel}
              className="w-full py-2.5 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] font-mono text-xs hover:border-[var(--erp-gold)] hover:text-[var(--erp-gold)] transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" /> Return to Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
