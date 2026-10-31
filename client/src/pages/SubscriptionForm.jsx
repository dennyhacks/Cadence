import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api.js';
import { Button, ErrorAlert } from '../components/ui.jsx';
import { Field, Select } from '../components/Field.jsx';
import PageHeader from '../components/PageHeader.jsx';
import LinesEditor, { emptyLine, linesFromApi, linesToBody } from '../components/LinesEditor.jsx';
import { TERMS } from './SubscriptionDetail.jsx';
import { formatMoney, toNumber } from '../format.js';
import { useTitle } from '../useTitle.js';

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function SubscriptionForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  useTitle(editing ? 'Edit subscription' : 'New subscription');
  const navigate = useNavigate();
  const [values, setValues] = useState({
    customer_id: '', plan_id: '', template_id: '', start_date: todayIso(), expiry_date: '', payment_terms: 'immediate', validity_days: '30',
  });
  const [lines, setLines] = useState([emptyLine()]);
  const [customers, setCustomers] = useState([]);
  const [plans, setPlans] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [products, setProducts] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/customers'), api.get('/plans'), api.get('/templates'), api.get('/products?variants=1'), api.get('/taxes'),
      editing ? api.get(`/subscriptions/${id}`) : null,
    ])
      .then(([c, p, t, pr, tx, sub]) => {
        setCustomers(c.customers);
        setPlans(p.plans);
        setTemplates(t.templates);
        setProducts(pr.products);
        setTaxes(tx.taxes);
        if (sub) {
          const s = sub.subscription;
          setValues({
            customer_id: String(s.customer_id), plan_id: String(s.plan_id), template_id: s.template_id ? String(s.template_id) : '',
            start_date: s.start_date, expiry_date: s.expiry_date ?? '', payment_terms: s.payment_terms, validity_days: String(s.validity_days),
          });
          setLines(linesFromApi(s.lines.map((l) => ({
            product_id: l.product_id, quantity: l.quantity, tax_ids: l.taxes.map((x) => x.id),
            variant: l.variant_label ? { attribute: l.variant_label.split(': ')[0], value: l.variant_label.split(': ').slice(1).join(': ') } : null,
          }))));
        }
      })
      .catch((e) => setFormError(e.message))
      .finally(() => setLoading(false));
  }, [editing, id]);

  const set = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  /** Choosing a template fills in the plan, validity and lines. Everything stays editable. */
  function useTemplate(e) {
    const template = templates.find((t) => t.id === Number(e.target.value));
    setValues((v) => ({
      ...v,
      template_id: e.target.value,
      ...(template && { plan_id: String(template.plan_id), validity_days: String(template.validity_days) }),
    }));
    if (template) setLines(linesFromApi(template.lines));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    const body = {
      customer_id: values.customer_id === '' ? undefined : Number(values.customer_id),
      plan_id: values.plan_id === '' ? undefined : Number(values.plan_id),
      template_id: values.template_id === '' ? null : Number(values.template_id),
      start_date: values.start_date, expiry_date: values.expiry_date || null,
      payment_terms: values.payment_terms, validity_days: toNumber(values.validity_days),
      lines: linesToBody(lines),
    };
    try {
      const d = await (editing ? api.put(`/subscriptions/${id}`, body) : api.post('/subscriptions', body));
      navigate(`/subscriptions/${d.subscription.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors);
      else setFormError(err.message);
      setSaving(false);
    }
  }

  const chosenPlan = plans.find((p) => p.id === Number(values.plan_id));

  if (loading) return <p className="text-muted">Loading…</p>;

  return (
    <>
      <PageHeader title={editing ? 'Edit subscription' : 'New subscription'} />
      <form onSubmit={onSubmit} noValidate className="max-w-3xl space-y-5">
        <ErrorAlert>{formError}</ErrorAlert>
        {!editing && templates.length > 0 && (
          <Select id="template_id" label="Start from a template" value={values.template_id} onChange={useTemplate} hint="Optional. It fills in the plan and lines, and you can change them.">
            <option value="">No template</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          <Select id="customer_id" label="Customer" value={values.customer_id} onChange={set('customer_id')} error={errors.customer_id}>
            <option value="">Choose a customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
            ))}
          </Select>
          <Select
            id="plan_id"
            label="Plan"
            value={values.plan_id}
            onChange={set('plan_id')}
            error={errors.plan_id}
            hint={chosenPlan && `The plan price of ${formatMoney(chosenPlan.price)} is added to the lines, billed ${chosenPlan.billing_period}.`}
          >
            <option value="">Choose a plan</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
          <Field id="start_date" label="Start date" type="date" value={values.start_date} onChange={set('start_date')} error={errors.start_date} />
          <Field id="expiry_date" label="Expiry date" type="date" value={values.expiry_date} onChange={set('expiry_date')} error={errors.expiry_date} hint="Leave empty if it has no end date." />
          <Select id="payment_terms" label="Payment terms" value={values.payment_terms} onChange={set('payment_terms')} error={errors.payment_terms}>
            {Object.entries(TERMS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
          <Field id="validity_days" label="Quotation is valid for (days)" type="number" inputMode="numeric" min="1" max="365" step="1" value={values.validity_days} onChange={set('validity_days')} error={errors.validity_days} />
        </div>
        <LinesEditor lines={lines} onChange={(l) => { setLines(l); setErrors((p) => ({ ...p, lines: undefined })); }} products={products} taxes={taxes} error={errors.lines} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={saving} loadingText="Saving…" className="w-auto!">
            {editing ? 'Save changes' : 'Save as draft'}
          </Button>
          <Link to={editing ? `/subscriptions/${id}` : '/subscriptions'} className="rounded-lg border border-line px-4 py-2.5 font-semibold hover:bg-paper">Cancel</Link>
        </div>
      </form>
    </>
  );
}
