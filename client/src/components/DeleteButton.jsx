import { useState } from 'react';

/** Two-step delete: the first click asks, the second confirms. */
export default function DeleteButton({ onConfirm, label, busy }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className="rounded-lg border border-danger/40 px-4 py-2.5 font-semibold text-danger hover:bg-danger-bg">
        {label}
      </button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2" role="group" aria-label="Confirm delete">
      <span className="text-sm text-danger">This cannot be undone.</span>
      <button type="button" disabled={busy} onClick={onConfirm} className="rounded-lg bg-danger px-4 py-2.5 font-semibold text-white disabled:opacity-70">
        Yes, delete
      </button>
      <button type="button" onClick={() => setAsking(false)} className="rounded-lg border border-line px-4 py-2.5 font-semibold hover:bg-paper">
        Keep it
      </button>
    </span>
  );
}
