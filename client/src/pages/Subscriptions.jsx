import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { ErrorAlert } from '../components/ui.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatusBadge, { STATUSES, STATUS_LABEL } from '../components/StatusBadge.jsx';
import { addLinkClass } from './Products.jsx';
import { lineSummary } from './Templates.jsx';
import { formatDay, formatMoney } from '../format.js';
import { useTitle } from '../useTitle.js';

const PAGE_SIZE = 10;

function StartSubscription() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    api.get('/templates').then((d) => setTemplates(d.templates)).catch((e) => setError(e.message));
  }, []);

  async function start(id) {
    setBusy(id);
    setError('');
    try {
      const { subscription } = await api.post('/subscriptions/from-template', { template_id: id });
      navigate(`/subscriptions/${subscription.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(null);
    }
  }

  if (!templates?.length) return error ? <ErrorAlert>{error}</ErrorAlert> : null;
  return (
    <section aria-labelledby="start-heading" className="mb-8">
      <h2 id="start-heading" className="mb-3 font-display text-lg font-semibold">Start a subscription</h2>
      <ErrorAlert>{error}</ErrorAlert>
      <ul className="grid gap-3 sm:grid-cols-2">
        {templates.map((t) => (
          <li key={t.id} className="flex flex-col rounded-xl border border-line bg-white p-4">
            <p className="font-medium">{t.name}</p>
            <p className="mt-0.5 text-sm text-muted">
              {t.plan_name}, billed {t.billing_period}
            </p>
            <p className="mt-2 flex-1 text-sm">{t.lines.map(lineSummary).join(', ')}</p>
            <button
              type="button"
              disabled={busy === t.id}
              onClick={() => start(t.id)}
              className="mt-3 self-start rounded-lg bg-leaf-600 px-4 py-2 font-semibold text-white hover:bg-leaf-700 disabled:opacity-70"
            >
              {busy === t.id ? 'Starting…' : 'Start this subscription'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Subscriptions() {
  const { user } = useAuth();
  const mine = user.role === 'customer';
  useTitle(mine ? 'My subscriptions' : 'Subscriptions');
  const [params, setParams] = useSearchParams();
  const status = STATUSES.includes(params.get('status')) ? params.get('status') : '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    const q = new URLSearchParams({ page, pageSize: PAGE_SIZE });
    if (status) q.set('status', status);
    api.get(`/subscriptions?${q}`).then(setData).catch((e) => setError(e.message));
  }, [status, page]);
  useEffect(load, [load]);

  const choose = (next) => setParams(next ? { status: next } : {});
  const go = (p) => setParams({ ...(status && { status }), page: p });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const filters = mine ? STATUSES.filter((s) => s !== 'draft') : STATUSES;

  return (
    <>
      <PageHeader title={mine ? 'My subscriptions' : 'Subscriptions'}>
        {mine ? 'Your subscriptions and where each one stands.' : 'Every subscription, from draft to closed.'}
      </PageHeader>
      {mine && <StartSubscription />}
      {!mine && (
        <div className="mb-4">
          <Link to="/subscriptions/new" className={addLinkClass}>New subscription</Link>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {['', ...filters].map((s) => (
          <button
            key={s || 'all'}
            type="button"
            aria-pressed={status === s}
            onClick={() => choose(s)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${
              status === s ? 'bg-pine-900 text-white' : 'bg-white ring-1 ring-line hover:bg-paper'
            }`}
          >
            {s ? STATUS_LABEL[s] : 'All'}
          </button>
        ))}
      </div>

      <ErrorAlert>{error}</ErrorAlert>
      {!error && data === null && <p className="text-muted">Loading subscriptions…</p>}
      {data?.subscriptions.length === 0 && (
        <p className="text-muted">{status ? `No ${STATUS_LABEL[status].toLowerCase()} subscriptions.` : 'No subscriptions yet.'}</p>
      )}
      {data?.subscriptions.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-line bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Number</th>
                  {!mine && <th scope="col" className="px-4 py-2.5 font-medium">Customer</th>}
                  <th scope="col" className="px-4 py-2.5 font-medium">Plan</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Starts</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Expires</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.subscriptions.map((s) => (
                  <tr key={s.id} className="border-b border-line last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 font-medium">
                      <Link to={`/subscriptions/${s.id}`} className="text-leaf-700 underline-offset-2 hover:underline">{s.number}</Link>
                    </td>
                    {!mine && <td className="px-4 py-3">{s.customer_name}</td>}
                    <td className="px-4 py-3">{s.plan_name}</td>
                    <td className="px-4 py-3"><StatusBadge status={s.status} paused={s.is_paused} /></td>
                    <td className="whitespace-nowrap px-4 py-3">{formatDay(s.start_date)}</td>
                    <td className="whitespace-nowrap px-4 py-3">{s.expiry_date ? formatDay(s.expiry_date) : 'No expiry'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{formatMoney(s.totals.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pages">
            <p className="text-muted">{data.total} subscription{data.total === 1 ? '' : 's'}</p>
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
