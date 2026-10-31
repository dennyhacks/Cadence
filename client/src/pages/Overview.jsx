import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { ErrorAlert } from '../components/ui.jsx';
import { Field, Select } from '../components/Field.jsx';
import PageHeader from '../components/PageHeader.jsx';
import MonthlyChart from '../components/MonthlyChart.jsx';
import { STATUSES, STATUS_LABEL } from '../components/StatusBadge.jsx';
import { METHODS } from './InvoiceDetail.jsx';
import { formatDay, formatMoney } from '../format.js';
import { useTitle } from '../useTitle.js';

const iso = (d) => d.toISOString().slice(0, 10);
const monthsAgo = (n) => {
  const d = new Date();
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, 1)));
};

const PRESETS = {
  last12: { label: 'Last 12 months', range: () => ({ from: monthsAgo(11), to: iso(new Date()) }) },
  last3: { label: 'Last 3 months', range: () => ({ from: monthsAgo(2), to: iso(new Date()) }) },
  thisYear: { label: 'This year', range: () => ({ from: `${new Date().getUTCFullYear()}-01-01`, to: iso(new Date()) }) },
  custom: { label: 'Choose dates', range: null },
};

function Figure({ label, value, note, to, tone = '' }) {
  const body = (
    <>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={`mt-1 font-display text-2xl font-semibold tracking-tight ${tone}`}>{value}</dd>
      {note && <dd className="mt-0.5 text-sm text-muted">{note}</dd>}
    </>
  );
  const box = 'block rounded-2xl border border-line bg-surface px-4 py-4';
  return to ? <Link to={to} className={`${box} hover:border-leaf-600`}>{body}</Link> : <div className={box}>{body}</div>;
}

export default function Overview() {
  const { user } = useAuth();
  useTitle('Overview');
  const [params, setParams] = useSearchParams();
  const preset = PRESETS[params.get('range')] ? params.get('range') : 'last12';
  const planId = params.get('plan') || '';
  const custom = { from: params.get('from') || monthsAgo(11), to: params.get('to') || iso(new Date()) };
  const range = preset === 'custom' ? custom : PRESETS[preset].range();

  const [plans, setPlans] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    api.get('/plans').then((d) => setPlans(d.plans)).catch(() => setPlans([]));
  }, []);

  const query = useMemo(() => {
    const q = new URLSearchParams({ from: range.from, to: range.to });
    if (planId) q.set('plan_id', planId);
    return q.toString();
  }, [range.from, range.to, planId]);

  useEffect(() => {
    let current = true;
    setError('');
    setFieldErrors({});
    api
      .get(`/dashboard?${query}`)
      .then((d) => current && setData(d))
      .catch((err) => {
        if (!current) return;
        if (err instanceof ApiError && err.errors) setFieldErrors(err.errors);
        else setError(err.message);
      });
    return () => {
      current = false;
    };
  }, [query]);

  const update = (patch) => {
    const next = Object.fromEntries([...params.entries()]);
    for (const [k, v] of Object.entries(patch)) {
      if (v === '' || v == null) delete next[k];
      else next[k] = v;
    }
    setParams(next);
  };
  const choosePreset = (e) => {
    const value = e.target.value;
    update(value === 'custom' ? { range: 'custom', from: range.from, to: range.to } : { range: value === 'last12' ? '' : value, from: '', to: '' });
  };

  const rev = data?.revenue;
  const planName = plans.find((p) => String(p.id) === planId)?.name;
  const empty = data && rev.invoice_count === 0 && rev.payment_count === 0;

  return (
    <>
      <PageHeader title={`Welcome, ${user.name.split(' ')[0]}`}>
        Where subscriptions, billing and payments stand{planName ? ` for ${planName}` : ''}.
      </PageHeader>

      <form onSubmit={(e) => e.preventDefault()} className="mb-6 grid gap-4 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Filters">
        <Select id="range" label="Period" value={preset} onChange={choosePreset}>
          {Object.entries(PRESETS).map(([value, p]) => (
            <option key={value} value={value}>{p.label}</option>
          ))}
        </Select>
        <Select id="plan" label="Plan" value={planId} onChange={(e) => update({ plan: e.target.value })}>
          <option value="">All plans</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
        {preset === 'custom' && (
          <>
            <Field id="from" label="From" type="date" value={custom.from} onChange={(e) => update({ from: e.target.value })} error={fieldErrors.from} />
            <Field id="to" label="To" type="date" value={custom.to} onChange={(e) => update({ to: e.target.value })} error={fieldErrors.to} />
          </>
        )}
      </form>

      <ErrorAlert>{error}</ErrorAlert>
      {fieldErrors.plan_id && <ErrorAlert>{fieldErrors.plan_id}</ErrorAlert>}
      {!data && !error && !Object.keys(fieldErrors).length && <p className="text-muted">Loading the numbers…</p>}

      {data && (
        <div className={fieldErrors.from || fieldErrors.to ? 'opacity-60' : ''}>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Figure label="Active subscriptions" value={data.subscriptions.active} note={data.subscriptions.paused ? `${data.subscriptions.paused} paused` : 'None paused'} to="/subscriptions?status=active" />
            <Figure label="Invoiced" value={formatMoney(rev.invoiced)} note={`${rev.invoice_count} invoice${rev.invoice_count === 1 ? '' : 's'}`} />
            <Figure label="Collected" value={formatMoney(rev.collected)} note={`${rev.payment_count} payment${rev.payment_count === 1 ? '' : 's'}`} to="/payments" />
            <Figure label="Outstanding now" value={formatMoney(rev.outstanding)} note="Confirmed, not yet paid" to="/invoices?status=confirmed" />
            <Figure label="Overdue now" value={formatMoney(rev.overdue)} note={`${rev.overdue_count} invoice${rev.overdue_count === 1 ? '' : 's'} past due`} tone={rev.overdue_count ? 'text-danger' : ''} to="/invoices?status=overdue" />
          </dl>

          <section className="mt-6 rounded-2xl border border-line bg-surface p-4 sm:p-5" aria-labelledby="chart-heading">
            <h2 id="chart-heading" className="mb-1 font-display text-lg font-semibold">Invoiced and collected by month</h2>
            {empty ? <p className="py-10 text-center text-muted">No invoices or payments in this period. Try a longer one.</p> : <MonthlyChart months={data.months} />}
          </section>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5" aria-labelledby="status-heading">
              <h2 id="status-heading" className="mb-3 font-display text-lg font-semibold">Subscriptions by status</h2>
              <ul className="divide-y divide-line">
                {STATUSES.map((s) => (
                  <li key={s}>
                    <Link to={`/subscriptions?status=${s}`} className="flex items-center justify-between py-2.5 hover:text-leaf-700">
                      <span>{STATUS_LABEL[s]}</span>
                      <span className="font-medium">{data.subscriptions.by_status[s]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5" aria-labelledby="plans-heading">
              <h2 id="plans-heading" className="mb-3 font-display text-lg font-semibold">By plan</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-line text-muted">
                    <tr>
                      <th scope="col" className="py-2 pr-3 font-medium">Plan</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Active</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Invoiced</th>
                      <th scope="col" className="py-2 pl-3 text-right font-medium">Collected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_plan.map((p) => (
                      <tr key={p.plan_id} className="border-b border-line last:border-0">
                        <th scope="row" className="py-2.5 pr-3 font-medium">{p.name}</th>
                        <td className="px-3 py-2.5 text-right">{p.active}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right">{formatMoney(p.invoiced)}</td>
                        <td className="whitespace-nowrap py-2.5 pl-3 text-right">{formatMoney(p.collected)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5" aria-labelledby="overdue-heading">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 id="overdue-heading" className="font-display text-lg font-semibold">Longest overdue</h2>
                <Link to="/invoices?status=overdue" className="text-sm font-medium text-leaf-700 hover:underline">See all overdue</Link>
              </div>
              {data.overdue_invoices.length === 0 ? (
                <p className="text-muted">Nothing is overdue. Well done.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {data.overdue_invoices.map((i) => (
                    <li key={i.id}>
                      <Link to={`/invoices/${i.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-leaf-700">
                        <span>
                          <span className="font-medium">{i.number}</span>
                          <span className="block text-sm text-muted">{i.customer_name}, due {formatDay(i.due_date)}</span>
                        </span>
                        <span className="whitespace-nowrap font-medium text-danger">{formatMoney(i.outstanding)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5" aria-labelledby="recent-heading">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 id="recent-heading" className="font-display text-lg font-semibold">Latest payments</h2>
                <Link to="/payments" className="text-sm font-medium text-leaf-700 hover:underline">See all payments</Link>
              </div>
              {data.recent_payments.length === 0 ? (
                <p className="text-muted">No payments in this period.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {data.recent_payments.map((p) => (
                    <li key={p.id}>
                      <Link to={`/invoices/${p.invoice_id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-leaf-700">
                        <span>
                          <span className="font-medium">{p.customer_name}</span>
                          <span className="block text-sm text-muted">{p.invoice_number}, {METHODS[p.method]}, {formatDay(p.paid_on)}</span>
                        </span>
                        <span className="whitespace-nowrap font-medium">{formatMoney(p.amount)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </>
  );
}
