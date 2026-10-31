export const STATUS_LABEL = { draft: 'Draft', quotation: 'Quotation', confirmed: 'Confirmed', active: 'Active', closed: 'Closed' };
export const STATUSES = Object.keys(STATUS_LABEL);

const TONE = {
  draft: 'bg-paper text-muted ring-1 ring-line',
  quotation: 'bg-signal/15 text-ink ring-1 ring-signal/40',
  confirmed: 'bg-leaf-50 text-leaf-700 ring-1 ring-leaf-600/30',
  active: 'bg-leaf-600 text-white',
  closed: 'bg-pine-900 text-pine-200',
};

export default function StatusBadge({ status, paused }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[status]}`}>{STATUS_LABEL[status]}</span>
      {paused && <span className="rounded-full bg-danger-bg px-2.5 py-0.5 text-xs font-medium text-danger">Paused</span>}
    </span>
  );
}

/** Where a subscription is in its life: Draft, Quotation, Confirmed, Active, Closed. */
export function StatusSteps({ status }) {
  const current = STATUSES.indexOf(status);
  return (
    <ol className="flex flex-wrap gap-x-1 gap-y-2 text-sm" aria-label="Status">
      {STATUSES.map((s, i) => (
        <li key={s} aria-current={i === current ? 'step' : undefined} className="flex items-center gap-1">
          <span
            className={`rounded-full px-3 py-1 font-medium ${
              i === current ? 'bg-leaf-600 text-white' : i < current ? 'bg-leaf-50 text-leaf-700' : 'bg-paper text-muted ring-1 ring-line'
            }`}
          >
            {STATUS_LABEL[s]}
          </span>
          {i < STATUSES.length - 1 && <span aria-hidden="true" className="text-line">›</span>}
        </li>
      ))}
    </ol>
  );
}

const INVOICE_LABEL = { draft: 'Draft', confirmed: 'Confirmed', paid: 'Paid', cancelled: 'Cancelled' };
const INVOICE_TONE = {
  draft: TONE.draft,
  confirmed: TONE.confirmed,
  paid: TONE.active,
  cancelled: 'bg-paper text-muted ring-1 ring-line line-through',
};

/** Draft, Confirmed or Paid, plus an Overdue flag when a confirmed invoice is past its due date. */
export function InvoiceBadge({ status, overdue }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${INVOICE_TONE[status]}`}>{INVOICE_LABEL[status]}</span>
      {overdue && <span className="rounded-full bg-danger-bg px-2.5 py-0.5 text-xs font-medium text-danger">Overdue</span>}
    </span>
  );
}
