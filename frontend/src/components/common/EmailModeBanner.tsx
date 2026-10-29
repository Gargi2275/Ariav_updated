import React from 'react';

export const EmailModeBanner: React.FC<{ mode?: string; testRecipient?: string }> = ({ mode }) => {
  if (!mode || mode === 'live') return null;
  return (
    <p className="border border-[var(--erp-gold)] bg-[var(--erp-gold)]/10 px-3 py-2 text-xs text-[var(--erp-text)]">
      Email sending is off. Save the mailbox, then turn on live sending.
    </p>
  );
};
