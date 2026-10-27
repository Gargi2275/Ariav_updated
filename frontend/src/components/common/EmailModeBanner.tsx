import React from 'react';
import type { EmailMode } from '../../services/poEmailApi';

export const EmailModeBanner: React.FC<{ mode?: EmailMode | string; testRecipient?: string }> = ({ mode, testRecipient }) => {
  if (!mode || mode === 'live') return null;
  const text = mode === 'test'
    ? `Test mode: emails go to ${testRecipient || 'the test recipient'}.`
    : 'Email sending is off.';
  return (
    <p className="border border-[var(--erp-gold)] bg-[var(--erp-gold)]/10 px-3 py-2 text-xs text-[var(--erp-text)]">
      {text}
    </p>
  );
};
