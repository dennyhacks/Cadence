import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api.js';
import { ErrorAlert, Notice } from '../components/ui.jsx';
import { Field, Select, Textarea } from '../components/Field.jsx';
import DeleteButton from '../components/DeleteButton.jsx';
import { InvoiceBadge } from '../components/StatusBadge.jsx';
import Logo from '../components/Logo.jsx';
import { formatDay, formatMoney, toNumber } from '../format.js';
import { useTitle } from '../useTitle.js';

export const METHODS = { cash: 'Cash', card: 'Card', bank_transfer: 'Bank transfer', upi: 'UPI', cheque: 'Cheque' };
const todayIso = () => new Date().toISOString().slice(0, 10);

function PaymentForm({ invoice, onSaved }) {
  const [values, setValues] = useState({ method: 'bank_transfer', amount: String(invoice.outstanding), paid_on: todayIso(), note: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const d = await api.post(`/invoices/${invoice.id}/payments`, { ...values, amount: toNumber(values.amount) });
      onSaved(d.invoice);
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors);
      else setFormError(err.message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-8 max-w-xl space-y-4 rounded-xl border border-line bg-white p-5 print:hidden">
      <h2 className="font-display text-lg font-semibold">Record a payment</h2>
      <ErrorAlert>{formError}</ErrorAlert>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select id="method" label="Method" value={values.method} onChange={set('method')} error={errors.method}>
          {Object.entries(METHODS).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </Select>
        <Field id="amount" label="Amount" type="number" inputMode="decimal" min="0" step="0.01" value={values.amount} onChange={set('amount')} error={errors.amount} hint={`${formatMoney(invoice.outstanding)} is still owed.`} />
        <Field id="paid_on" label="Date received" type="date" max={todayIso()} value={values.paid_on} onChange={set('paid_on')} error={errors.paid_on} />
      </div>
      <Textarea id="note" label="Note" value={values.note} onChange={set('note')} error={errors.note} hint="Optional, for example a cheque number." />
      <button type="submit" disabled={saving} className="rounded-lg bg-leaf-600 px-4 py-2.5 font-semibold text-white hover:bg-leaf-700 disabled:opacity-70">
        {saving ? 'Saving…' : 'Record payment'}
      </button>
    </form>
  );
}

export default function InvoiceDetail() {
  const { id } = useParams();
  const [inv, setInv] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useTitle(inv ? inv.number : 'Invoice');

  useEffect(() => {
    api.get(`/invoices/${id}`).then((d) => setInv(d.invoice)).catch((e) => setError(e.message));
  }, [id]);

  async function run(action) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const d = await api.post(`/invoices/${id}/action`, { action });
      setInv(d.invoice);
      if (action === 'send') setNotice(`Sent to ${d.invoice.customer_email}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!inv) {
    return (
      <>
        <Link to="/invoices" className="text-sm font-medium text-leaf-700 hover:underline">All invoices</Link>
        {error ? <div className="mt-4"><ErrorAlert>{error}</ErrorAlert></div> : <p className="mt-4 text-muted">Loading invoice…</p>}
      </>
    );
  }

  const team = inv.actions.length > 0 || inv.status === 'cancelled';
  const primary = { confirm: 'Confirm invoice', send: inv.sent_at ? 'Send again' : 'Send to customer' };

  return (
    <>
      <Link to="/invoices" className="text-sm font-medium text-leaf-700 hover:underline print:hidden">{team ? 'All invoices' : 'My invoices'}</Link>

      <div className="mt-3 flex flex-wrap items-center gap-3 print:hidden">
        {['confirm', 'send'].filter((a) => inv.actions.includes(a)).map((a) => (
          <button key={a} type="button" disabled={busy} onClick={() => run(a)} className="rounded-lg bg-leaf-600 px-4 py-2.5 font-semibold text-white hover:bg-leaf-700 disabled:opacity-70">
            {primary[a]}
          </button>
        ))}
        <button type="button" onClick={() => window.print()} className="rounded-lg border border-line px-4 py-2.5 font-semibold hover:bg-paper">Print</button>
        {inv.actions.includes('cancel') && (
          <DeleteButton label="Cancel invoice" confirmLabel="Yes, cancel it" message="Cancelling cannot be undone." keepLabel="Keep it" busy={busy} onConfirm={() => run('cancel')} />
        )}
      </div>
      <div className="mt-4 space-y-3 print:hidden">
        <ErrorAlert>{error}</ErrorAlert>
        <Notice>{notice}</Notice>
      </div>

      <article className="mt-5 rounded-xl border border-line bg-white p-6 sm:p-8 print:mt-0 print:rounded-none print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
          <div>
            <Logo />
            <p className="mt-2 text-sm text-muted">Brightloop Software</p>
          </div>
          <div className="text-right">
            <h1 className="font-display text-2xl font-semibold">Invoice {inv.number}</h1>
            <p className="mt-1.5"><InvoiceBadge status={inv.status} overdue={inv.is_overdue} /></p>
          </div>
        </header>

        <dl className="grid gap-x-8 gap-y-4 py-6 sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-sm text-muted">Billed to</dt><dd className="mt-0.5 font-medium">{inv.customer_name}<span className="block text-sm font-normal text-muted">{inv.customer_email}</span></dd></div>
          <div><dt className="text-sm text-muted">Subscription</dt><dd className="mt-0.5 font-medium">{inv.subscription_number}<span className="block text-sm font-normal text-muted">{inv.plan_name}</span></dd></div>
          <div><dt className="text-sm text-muted">Billing period</dt><dd className="mt-0.5 font-medium">{formatDay(inv.period_start)} to {formatDay(inv.period_end)}</dd></div>
          <div><dt className="text-sm text-muted">Invoice date</dt><dd className="mt-0.5 font-medium">{formatDay(inv.invoice_date)}<span className="block text-sm font-normal text-muted">Due {formatDay(inv.due_date)}</span></dd></div>
        </dl>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-y border-line text-muted">
              <tr>
                <th scope="col" className="py-2.5 pr-4 font-medium">Description</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Qty</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Unit price</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Discount</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Tax</th>
                <th scope="col" className="py-2.5 pl-4 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((l) => (
                <tr key={l.id} className="border-b border-line">
                  <td className="py-3 pr-4 font-medium">{l.description}</td>
                  <td className="px-4 py-3 text-right">{l.quantity}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{formatMoney(l.unit_price)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{l.discount_amount > 0 ? `−${formatMoney(l.discount_amount)}` : ''}</td>
                  <td className="px-4 py-3">{l.tax_label ?? ''}</td>
                  <td className="whitespace-nowrap py-3 pl-4 text-right">{formatMoney(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            {inv.discounts.length > 0 && (
              <>
                <h2 className="text-sm font-medium text-muted">Discounts applied</h2>
                <ul className="mt-1 text-sm">
                  {inv.discounts.map((d) => (
                    <li key={d.discount_id}>{d.name}: −{formatMoney(d.amount)}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{formatMoney(inv.untaxed_total)}</dd></div>
            {inv.discount_total > 0 && <div className="flex justify-between"><dt className="text-muted">Discounts</dt><dd>−{formatMoney(inv.discount_total)}</dd></div>}
            <div className="flex justify-between"><dt className="text-muted">Tax</dt><dd>{formatMoney(inv.tax_total)}</dd></div>
            <div className="flex justify-between border-t border-line pt-2 text-base font-semibold"><dt>Total</dt><dd>{formatMoney(inv.total)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Paid</dt><dd>{formatMoney(inv.amount_paid)}</dd></div>
            <div className={`flex justify-between font-semibold ${inv.is_overdue ? 'text-danger' : ''}`}><dt>Outstanding</dt><dd>{inv.status === 'cancelled' ? formatMoney(0) : formatMoney(inv.outstanding)}</dd></div>
          </dl>
        </div>

        {inv.payments.length > 0 && (
          <section className="mt-8" aria-labelledby="payments-heading">
            <h2 id="payments-heading" className="mb-2 font-display text-lg font-semibold">Payments</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-y border-line text-muted">
                  <tr>
                    <th scope="col" className="py-2 pr-4 font-medium">Date</th>
                    <th scope="col" className="px-4 py-2 font-medium">Method</th>
                    <th scope="col" className="px-4 py-2 font-medium">Note</th>
                    <th scope="col" className="py-2 pl-4 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.payments.map((p) => (
                    <tr key={p.id} className="border-b border-line">
                      <td className="whitespace-nowrap py-2.5 pr-4">{formatDay(p.paid_on)}</td>
                      <td className="px-4 py-2.5">{METHODS[p.method]}</td>
                      <td className="px-4 py-2.5 text-muted">{p.note}</td>
                      <td className="whitespace-nowrap py-2.5 pl-4 text-right">{formatMoney(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {inv.status === 'paid' && <p className="mt-6 font-display text-lg font-semibold text-leaf-700">Paid in full. Thank you.</p>}
      </article>

      {inv.can_record_payment && <PaymentForm key={inv.amount_paid} invoice={inv} onSaved={setInv} />}
    </>
  );
}
