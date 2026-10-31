import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { ErrorAlert, Notice } from '../components/ui.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { InvoiceBadge } from '../components/StatusBadge.jsx';
import { formatDay, formatMoney } from '../format.js';
import { useTitle } from '../useTitle.js';

const PAGE_SIZE = 10;
const FILTERS = [
  ['', 'All'],
  ['draft', 'Draft'],
  ['confirmed', 'Confirmed'],
  ['paid', 'Paid'],
  ['overdue', 'Overdue'],
  ['cancelled', 'Cancelled'],
];

function Figure({ label, value, tone = '' }) {
  return (
    <div className="rounded-xl border border-line bg-white px-4 py-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={`mt-0.5 font-display text-xl font-semibold ${tone}`}>{value}</dd>
    </div>
  );
}

export default function Invoices() {
  const { user } = useAuth();
  const mine = user.role === 'customer';
  useTitle(mine ? 'My invoices' : 'Invoices');
  const [params, setParams] = useSearchParams();
  const known = FILTERS.map(([v]) => v);
  const status = known.includes(params.get('status')) ? params.get('status') : '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [generating, setGenerating] = useState(false);

  const load = useCallback(() => {
    const q = new URLSearchParams({ page, pageSize: PAGE_SIZE });
    if (status) q.set('status', status);
    api.get(`/invoices?${q}`).then(setData).catch((e) => setError(e.message));
  }, [status, page]);
  useEffect(load, [load]);

  async function generate() {
    setGenerating(true);
    setError('');
    setNotice('');
    try {
      const r = await api.post('/invoices/generate');
      setNotice(
        r.created === 0
          ? 'Everything due is already invoiced. Nothing new was created.'
          : `Created ${r.created} draft invoice${r.created === 1 ? '' : 's'} for ${r.subscriptions} subscription${r.subscriptions === 1 ? '' : 's'}.`
      );
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  const choose = (next) => setParams(next ? { status: next } : {});
  const go = (p) => setParams({ ...(status && { status }), page: p });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const filters = mine ? FILTERS.filter(([v]) => ['', 'confirmed', 'paid', 'overdue'].includes(v)) : FILTERS;

  return (
    <>
      <PageHeader title={mine ? 'My invoices' : 'Invoices'}>
        {mine ? 'Your invoices and what is still to pay.' : 'Invoices are created from active subscriptions. Confirm, send and print them here.'}
      </PageHeader>

      {data && (
        <dl className="mb-6 grid gap-3 sm:grid-cols-3">
          <Figure label="Paid" value={formatMoney(data.summary.paid)} />
          <Figure label="Outstanding" value={formatMoney(data.summary.outstanding)} />
          <Figure label={`Overdue (${data.summary.overdue_count})`} value={formatMoney(data.summary.overdue)} tone={data.summary.overdue_count ? 'text-danger' : ''} />
        </dl>
      )}

      {!mine && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={generate} disabled={generating} className="rounded-lg bg-leaf-600 px-4 py-2.5 font-semibold text-white hover:bg-leaf-700 disabled:opacity-70">
            {generating ? 'Generating…' : 'Generate due invoices'}
          </button>
          <p className="text-sm text-muted">This also runs on its own every hour. Running it again never bills anything twice.</p>
        </div>
      )}
      <div className="mb-4"><Notice>{notice}</Notice></div>

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {filters.map(([value, label]) => (
          <button key={label} type="button" aria-pressed={status === value} onClick={() => choose(value)} className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${status === value ? 'bg-pine-900 text-white' : 'bg-white ring-1 ring-line hover:bg-paper'}`}>
            {label}
          </button>
        ))}
      </div>

      <ErrorAlert>{error}</ErrorAlert>
      {!error && data === null && <p className="text-muted">Loading invoices…</p>}
      {data?.invoices.length === 0 && <p className="text-muted">{status ? 'No invoices match this filter.' : 'No invoices yet.'}</p>}
      {data?.invoices.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-line bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Invoice</th>
                  {!mine && <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">Customer</th>}
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                  <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">Due</th>
                  <th scope="col" className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">Total</th>
                  <th scope="col" className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">Paid</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((i) => (
                  <tr key={i.id} className="border-b border-line last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 font-medium">
                      <Link to={`/invoices/${i.id}`} className="text-leaf-700 underline-offset-2 hover:underline">{i.number}</Link>
                      <span className="block text-xs font-normal text-muted">{i.subscription_number}</span>
                      {!mine && <span className="block text-xs font-normal text-muted sm:hidden">{i.customer_name}</span>}
                    </td>
                    {!mine && <td className="hidden px-4 py-3 sm:table-cell">{i.customer_name}</td>}
                    <td className="px-4 py-3"><InvoiceBadge status={i.status} overdue={i.is_overdue} /></td>
                    <td className="hidden whitespace-nowrap px-4 py-3 sm:table-cell">{formatDay(i.due_date)}</td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-right sm:table-cell">{formatMoney(i.total)}</td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-right sm:table-cell">{formatMoney(i.amount_paid)}</td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right ${i.is_overdue ? 'font-medium text-danger' : ''}`}>
                      {i.status === 'cancelled' ? '–' : formatMoney(i.outstanding)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pages">
            <p className="text-muted">{data.total} invoice{data.total === 1 ? '' : 's'}</p>
            <div className="flex items-center gap-3">
              <button type="button" disabled={page <= 1} onClick={() => go(page - 1)} className="rounded-lg border border-line px-3 py-1.5 font-medium enabled:hover:bg-paper disabled:opacity-50">Previous</button>
              <span>Page {page} of {pages}</span>
              <button type="button" disabled={page >= pages} onClick={() => go(page + 1)} className="rounded-lg border border-line px-3 py-1.5 font-medium enabled:hover:bg-paper disabled:opacity-50">Next</button>
            </div>
          </nav>
        </>
      )}
    </>
  );
}
