import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { ErrorAlert } from '../components/ui.jsx';
import PageHeader from '../components/PageHeader.jsx';
import DeleteButton from '../components/DeleteButton.jsx';
import StatusBadge, { StatusSteps } from '../components/StatusBadge.jsx';
import { formatDay, formatMoney } from '../format.js';
import { useTitle } from '../useTitle.js';

export const TERMS = { immediate: 'Immediate payment', net_15: '15 days', net_30: '30 days', net_45: '45 days' };

const ACTION = {
  send: 'Send quotation',
  confirm: 'Confirm',
  activate: 'Activate',
  pause: 'Pause',
  resume: 'Resume',
  renew: 'Renew',
};

function Fact({ label, children }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium">{children}</dd>
    </div>
  );
}

export default function SubscriptionDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sub, setSub] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useTitle(sub ? sub.number : 'Subscription');

  useEffect(() => {
    api.get(`/subscriptions/${id}`).then((d) => setSub(d.subscription)).catch((e) => setError(e.message));
  }, [id]);

  async function run(action) {
    setBusy(true);
    setError('');
    try {
      const d = await api.post(`/subscriptions/${id}/action`, { action });
      setSub(d.subscription);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.del(`/subscriptions/${id}`);
      navigate('/subscriptions');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const team = user.role !== 'customer';
  if (!sub) {
    return (
      <>
        <Link to="/subscriptions" className="text-sm font-medium text-leaf-700 hover:underline">All subscriptions</Link>
        {error ? <div className="mt-4"><ErrorAlert>{error}</ErrorAlert></div> : <p className="mt-4 text-muted">Loading subscription…</p>}
      </>
    );
  }

  const editable = team && ['draft', 'quotation'].includes(sub.status);
  const plain = sub.actions.filter((a) => ACTION[a]);

  return (
    <>
      <Link to="/subscriptions" className="text-sm font-medium text-leaf-700 hover:underline">
        {team ? 'All subscriptions' : 'My subscriptions'}
      </Link>
      <div className="mt-3">
        <PageHeader title={sub.number}>
          <span className="inline-flex items-center gap-3"><StatusBadge status={sub.status} paused={sub.is_paused} /></span>
        </PageHeader>
      </div>
      <div className="mb-6"><StatusSteps status={sub.status} /></div>

      <ErrorAlert>{error}</ErrorAlert>
      <div className="my-4 flex flex-wrap items-center gap-3">
        {plain.map((a) => (
          <button key={a} type="button" disabled={busy} onClick={() => run(a)} className="rounded-lg bg-leaf-600 px-4 py-2.5 font-semibold text-white hover:bg-leaf-700 disabled:opacity-70">
            {ACTION[a]}
          </button>
        ))}
        {sub.actions.includes('close') && (
          <DeleteButton label="Close subscription" confirmLabel="Yes, close it" message="Closing ends this subscription." keepLabel="Keep it open" busy={busy} onConfirm={() => run('close')} />
        )}
        {editable && <Link to={`/subscriptions/${sub.id}/edit`} className="rounded-lg border border-line px-4 py-2.5 font-semibold hover:bg-paper">Edit</Link>}
        {team && sub.status === 'draft' && <DeleteButton label="Delete draft" busy={busy} onConfirm={remove} />}
      </div>

      <dl className="grid gap-x-8 gap-y-4 rounded-xl border border-line bg-white p-5 sm:grid-cols-2 lg:grid-cols-3">
        <Fact label="Customer">{sub.customer_name}<span className="block text-sm font-normal text-muted">{sub.customer_email}</span></Fact>
        <Fact label="Plan">{sub.plan_name}<span className="block text-sm font-normal text-muted">{formatMoney(sub.plan_price)}, billed {sub.billing_period}</span></Fact>
        <Fact label="Payment terms">{TERMS[sub.payment_terms]}</Fact>
        <Fact label="Starts">{formatDay(sub.start_date)}</Fact>
        <Fact label="Expires">{sub.expiry_date ? formatDay(sub.expiry_date) : 'No expiry date'}</Fact>
        {sub.quote_valid_until && sub.status === 'quotation' && <Fact label="Quotation valid until">{formatDay(sub.quote_valid_until)}</Fact>}
      </dl>

      <h2 className="mb-3 mt-8 font-display text-lg font-semibold">Lines</h2>
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-muted">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">Product</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Quantity</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Unit price</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Taxes</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {sub.lines.map((l) => (
              <tr key={l.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-medium">{l.product_name}{l.variant_label && <span className="block text-sm font-normal text-muted">{l.variant_label}</span>}</td>
                <td className="px-4 py-3 text-right">{l.quantity}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">{formatMoney(l.unit_price)}</td>
                <td className="px-4 py-3">{l.taxes.length ? l.taxes.map((t) => `${t.name}`).join(', ') : 'None'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">{formatMoney(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="ml-auto mt-4 w-full max-w-xs space-y-1.5 text-sm">
        <div className="flex justify-between"><dt className="text-muted">Lines before tax</dt><dd>{formatMoney(sub.totals.untaxed)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted">Tax</dt><dd>{formatMoney(sub.totals.tax)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted">{sub.plan_name} plan price</dt><dd>{formatMoney(sub.totals.plan_price)}</dd></div>
        <div className="flex justify-between border-t border-line pt-2 text-base font-semibold"><dt>Total</dt><dd>{formatMoney(sub.totals.total)}</dd></div>
      </dl>
    </>
  );
}
