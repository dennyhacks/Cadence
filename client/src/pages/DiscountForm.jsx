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
  name: '', type: 'percentage', value: '', min_purchase: '', min_quantity: '', start_date: '', end_date: '',
  usage_limit: '', applies_to: 'subscription', product_ids: [],
};

export default function DiscountForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  useTitle(editing ? 'Edit discount' : 'New discount');
  const navigate = useNavigate();
  const [values, setValues] = useState(EMPTY);
  const [products, setProducts] = useState([]);
  const [timesUsed, setTimesUsed] = useState(0);
  const [loading, setLoading] = useState(editing);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/products').then((d) => setProducts(d.products)).catch((e) => setFormError(e.message));
  }, []);

  useEffect(() => {
    if (!editing) return;
    api
      .get(`/discounts/${id}`)
      .then(({ discount: d }) => {
        setTimesUsed(d.times_used);
        setValues({
          name: d.name, type: d.type, value: String(d.value), applies_to: d.applies_to, product_ids: d.product_ids,
          min_purchase: d.min_purchase == null ? '' : String(d.min_purchase),
          min_quantity: d.min_quantity == null ? '' : String(d.min_quantity),
          usage_limit: d.usage_limit == null ? '' : String(d.usage_limit),
          start_date: d.start_date, end_date: d.end_date ?? '',
        });
      })
      .catch((e) => setFormError(e.message))
      .finally(() => setLoading(false));
  }, [editing, id]);

  const set = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };
  const toggleProduct = (productId) => (e) => {
    setValues((v) => ({
      ...v,
      product_ids: e.target.checked ? [...v.product_ids, productId] : v.product_ids.filter((p) => p !== productId),
    }));
    setErrors((prev) => ({ ...prev, product_ids: undefined }));
  };

  async function onSubmit(e) {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    const blank = (text, parse) => (text === '' ? null : parse(text));
    const body = {
      name: values.name, type: values.type, value: toNumber(values.value),
      min_purchase: blank(values.min_purchase, Number), min_quantity: blank(values.min_quantity, Number),
      usage_limit: blank(values.usage_limit, Number),
      start_date: values.start_date, end_date: values.end_date || null,
      applies_to: values.applies_to, product_ids: values.applies_to === 'products' ? values.product_ids : [],
    };
    try {
      await (editing ? api.put(`/discounts/${id}`, body) : api.post('/discounts', body));
      navigate('/discounts');
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors);
      else setFormError(err.message);
      setSaving(false);
    }
  }

  async function onDelete() {
    setSaving(true);
    try {
      await api.del(`/discounts/${id}`);
      navigate('/discounts');
    } catch (err) {
      setFormError(err.message);
      setSaving(false);
    }
  }

  if (loading) return <p className="text-muted">Loading discount…</p>;

  const percentage = values.type === 'percentage';

  return (
    <>
      <PageHeader title={editing ? 'Edit discount' : 'Add discount'} />
      <form onSubmit={onSubmit} noValidate className="max-w-2xl space-y-5">
        <ErrorAlert>{formError}</ErrorAlert>
        <Field id="name" label="Name" value={values.name} onChange={set('name')} error={errors.name} />
        <div className="grid gap-5 sm:grid-cols-2">
          <Select id="type" label="Type" value={values.type} onChange={set('type')} error={errors.type}>
            <option value="percentage">Percentage</option>
            <option value="fixed">Fixed amount</option>
          </Select>
          <Field id="value" label={percentage ? 'Percentage off (%)' : 'Amount off'} type="number" inputMode="decimal" min="0" step="0.01" value={values.value} onChange={set('value')} error={errors.value} />
        </div>

        <fieldset className="rounded-2xl border border-line bg-surface p-4">
          <legend className="px-1 font-display text-lg font-semibold">When it applies</legend>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="min_purchase" label="Minimum purchase" type="number" inputMode="decimal" min="0" step="0.01" value={values.min_purchase} onChange={set('min_purchase')} error={errors.min_purchase} hint="Leave empty for no minimum." />
            <Field id="min_quantity" label="Minimum quantity" type="number" inputMode="numeric" min="1" step="1" value={values.min_quantity} onChange={set('min_quantity')} error={errors.min_quantity} hint="Leave empty for no minimum." />
            <Field id="start_date" label="Starts on" type="date" value={values.start_date} onChange={set('start_date')} error={errors.start_date} />
            <Field id="end_date" label="Ends on" type="date" value={values.end_date} onChange={set('end_date')} error={errors.end_date} hint="Leave empty if it never ends." />
          </div>
          <div className="mt-5">
            <Field id="usage_limit" label="Times it can be used" type="number" inputMode="numeric" min="1" step="1" value={values.usage_limit} onChange={set('usage_limit')} error={errors.usage_limit} hint={editing ? `Used ${timesUsed} so far. Leave empty for no limit.` : 'Leave empty for no limit.'} />
          </div>
        </fieldset>

        <fieldset className="rounded-2xl border border-line bg-surface p-4">
          <legend className="px-1 font-display text-lg font-semibold">What it applies to</legend>
          <Select id="applies_to" label="Applies to" value={values.applies_to} onChange={set('applies_to')} error={errors.applies_to}>
            <option value="subscription">Whole subscriptions</option>
            <option value="products">Specific products</option>
          </Select>
          {values.applies_to === 'products' && (
            <div className="mt-4 space-y-3">
              {products.length === 0 && <p className="text-sm text-muted">Add a product first, then choose it here.</p>}
              {products.map((p) => (
                <Checkbox key={p.id} id={`product-${p.id}`} label={p.name} checked={values.product_ids.includes(p.id)} onChange={toggleProduct(p.id)} />
              ))}
              {errors.product_ids && <p className="text-sm text-danger">{errors.product_ids}</p>}
            </div>
          )}
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={saving} loadingText="Saving…" className="w-auto!">
            {editing ? 'Save changes' : 'Add discount'}
          </Button>
          <Link to="/discounts" className="rounded-full border border-line px-4 py-2.5 font-semibold hover:bg-white/10">Cancel</Link>
          {editing && <DeleteButton label="Delete discount" busy={saving} onConfirm={onDelete} />}
        </div>
      </form>
    </>
  );
}
