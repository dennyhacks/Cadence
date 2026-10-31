import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api.js';
import { Button, ErrorAlert } from '../components/ui.jsx';
import { Checkbox, Field, Select } from '../components/Field.jsx';
import PageHeader from '../components/PageHeader.jsx';
import DeleteButton from '../components/DeleteButton.jsx';
import { toNumber } from '../format.js';
import { useTitle } from '../useTitle.js';

const EMPTY = {
  name: '', price: '', billing_period: 'monthly', min_quantity: '1', start_date: '', end_date: '',
  auto_close: false, closable: false, pausable: false, renewable: false,
};

export default function PlanForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  useTitle(editing ? 'Edit plan' : 'New plan');
  const navigate = useNavigate();
  const [values, setValues] = useState(EMPTY);
  const [loading, setLoading] = useState(editing);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) return;
    api
      .get(`/plans/${id}`)
      .then(({ plan: p }) =>
        setValues({ ...p, price: String(p.price), min_quantity: String(p.min_quantity), end_date: p.end_date ?? '' })
      )
      .catch((e) => setFormError(e.message))
      .finally(() => setLoading(false));
  }, [editing, id]);

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  async function onSubmit(e) {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    const body = {
      name: values.name, billing_period: values.billing_period,
      price: toNumber(values.price), min_quantity: toNumber(values.min_quantity),
      start_date: values.start_date, end_date: values.end_date || null,
      auto_close: values.auto_close, closable: values.closable, pausable: values.pausable, renewable: values.renewable,
    };
    try {
      await (editing ? api.put(`/plans/${id}`, body) : api.post('/plans', body));
      navigate('/plans');
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors);
      else setFormError(err.message);
      setSaving(false);
    }
  }

  async function onDelete() {
    setSaving(true);
    try {
      await api.del(`/plans/${id}`);
      navigate('/plans');
    } catch (err) {
      setFormError(err.message);
      setSaving(false);
    }
  }

  if (loading) return <p className="text-muted">Loading plan…</p>;

  return (
    <>
      <PageHeader title={editing ? 'Edit plan' : 'Add plan'} />
      <form onSubmit={onSubmit} noValidate className="max-w-2xl space-y-5">
        <ErrorAlert>{formError}</ErrorAlert>
        <Field id="name" label="Name" value={values.name} onChange={set('name')} error={errors.name} />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="price" label="Price" type="number" inputMode="decimal" min="0" step="0.01" value={values.price} onChange={set('price')} error={errors.price} />
          <Select id="billing_period" label="Billing period" value={values.billing_period} onChange={set('billing_period')} error={errors.billing_period}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </Select>
        </div>
        <Field id="min_quantity" label="Minimum quantity" type="number" inputMode="numeric" min="1" step="1" value={values.min_quantity} onChange={set('min_quantity')} error={errors.min_quantity} />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="start_date" label="Available from" type="date" value={values.start_date} onChange={set('start_date')} error={errors.start_date} />
          <Field id="end_date" label="Available until" type="date" value={values.end_date} onChange={set('end_date')} error={errors.end_date} hint="Leave empty if the plan has no end date." />
        </div>

        <fieldset className="space-y-3 rounded-2xl border border-line bg-surface p-4">
          <legend className="px-1 font-display text-lg font-semibold">What can happen to its subscriptions</legend>
          <Checkbox id="auto_close" label="Close on its own" hint="Subscriptions close automatically at the end date." checked={values.auto_close} onChange={set('auto_close')} />
          <Checkbox id="closable" label="Can be closed early" checked={values.closable} onChange={set('closable')} />
          <Checkbox id="pausable" label="Can be paused" checked={values.pausable} onChange={set('pausable')} />
          <Checkbox id="renewable" label="Can be renewed" checked={values.renewable} onChange={set('renewable')} />
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={saving} loadingText="Saving…" className="w-auto!">
            {editing ? 'Save changes' : 'Add plan'}
          </Button>
          <Link to="/plans" className="rounded-full border border-line px-4 py-2.5 font-semibold hover:bg-white/10">Cancel</Link>
          {editing && <DeleteButton label="Delete plan" busy={saving} onConfirm={onDelete} />}
        </div>
      </form>
    </>
  );
}
