import { useState } from 'react';

/** Two-step delete: the first click asks, the second confirms. */
export default function DeleteButton({ onConfirm, label, busy, confirmLabel = 'Yes, delete', message = 'This cannot be undone.', keepLabel = 'Keep it' }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className="rounded-full border border-danger/40 px-4 py-2.5 font-semibold text-danger hover:bg-danger-bg">
        {label}
      </button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2" role="group" aria-label="Confirm delete">
      <span className="text-sm text-danger">{message}</span>
      <button type="button" disabled={busy} onClick={onConfirm} className="rounded-full bg-danger px-4 py-2.5 font-semibold text-black disabled:opacity-70">
        {confirmLabel}
      </button>
      <button type="button" onClick={() => setAsking(false)} className="rounded-full border border-line px-4 py-2.5 font-semibold hover:bg-white/10">
        {keepLabel}
      </button>
    </span>
  );
}
