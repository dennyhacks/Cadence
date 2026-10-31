import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api.js';
import { Button, ErrorAlert } from '../components/ui.jsx';
import { Field, Select, Textarea } from '../components/Field.jsx';
import PageHeader from '../components/PageHeader.jsx';
import DeleteButton from '../components/DeleteButton.jsx';
import { formatMoney, toNumber } from '../format.js';
import { useTitle } from '../useTitle.js';

const EMPTY = { name: '', type: 'service', sales_price: '', cost_price: '', notes: '', variants: [] };

export default function ProductForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  useTitle(editing ? 'Edit product' : 'New product');
  const navigate = useNavigate();
  const [values, setValues] = useState(EMPTY);
  const [loading, setLoading] = useState(editing);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) return;
    api
      .get(`/products/${id}`)
      .then(({ product: p }) =>
        setValues({
          name: p.name, type: p.type, sales_price: String(p.sales_price), cost_price: String(p.cost_price),
          notes: p.notes ?? '',
          variants: p.variants.map((v) => ({ attribute: v.attribute, value: v.value, extra_price: String(v.extra_price) })),
        })
      )
      .catch((e) => setFormError(e.message))
      .finally(() => setLoading(false));
  }, [editing, id]);

  const set = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };
  const setVariant = (i, key) => (e) => {
    setValues((v) => ({ ...v, variants: v.variants.map((row, j) => (j === i ? { ...row, [key]: e.target.value } : row)) }));
    setErrors((prev) => ({ ...prev, variants: undefined }));
  };
  const addVariant = () => setValues((v) => ({ ...v, variants: [...v.variants, { attribute: '', value: '', extra_price: '0' }] }));
  const removeVariant = (i) => setValues((v) => ({ ...v, variants: v.variants.filter((_, j) => j !== i) }));

  async function onSubmit(e) {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    const body = {
      ...values,
      sales_price: toNumber(values.sales_price),
      cost_price: toNumber(values.cost_price),
      variants: values.variants.map((v) => ({ ...v, extra_price: toNumber(v.extra_price) })),
    };
    try {
      await (editing ? api.put(`/products/${id}`, body) : api.post('/products', body));
      navigate('/products');
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors);
      else setFormError(err.message);
      setSaving(false);
    }
  }

  async function onDelete() {
    setSaving(true);
    try {
      await api.del(`/products/${id}`);
      navigate('/products');
    } catch (err) {
      setFormError(err.message);
      setSaving(false);
    }
  }

  if (loading) return <p className="text-muted">Loading product…</p>;

  return (
    <>
      <PageHeader title={editing ? 'Edit product' : 'Add product'} />
      <form onSubmit={onSubmit} noValidate className="max-w-2xl space-y-5">
        <ErrorAlert>{formError}</ErrorAlert>
        <Field id="name" label="Name" value={values.name} onChange={set('name')} error={errors.name} />
        <Select id="type" label="Type" value={values.type} onChange={set('type')} error={errors.type}>
          <option value="service">Service</option>
          <option value="goods">Goods</option>
        </Select>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="sales_price" label="Sales price" type="number" inputMode="decimal" min="0" step="0.01" value={values.sales_price} onChange={set('sales_price')} error={errors.sales_price} />
          <Field id="cost_price" label="Cost price" type="number" inputMode="decimal" min="0" step="0.01" value={values.cost_price} onChange={set('cost_price')} error={errors.cost_price} />
        </div>
        <Textarea id="notes" label="Notes" value={values.notes} onChange={set('notes')} error={errors.notes} />

        <fieldset className="rounded-2xl border border-line bg-surface p-4">
          <legend className="px-1 font-display text-lg font-semibold">Variants</legend>
          <p className="mb-3 text-sm text-muted">
            A variant adds an amount to the sales price. For example, Brand: Odoo adds 560.
          </p>
          {values.variants.map((v, i) => (
            <div key={i} className="mb-4 grid gap-3 border-b border-line pb-4 sm:grid-cols-[1fr_1fr_8rem_auto] sm:items-end">
              <Field id={`variant-attribute-${i}`} label="Attribute" value={v.attribute} onChange={setVariant(i, 'attribute')} />
              <Field id={`variant-value-${i}`} label="Value" value={v.value} onChange={setVariant(i, 'value')} />
              <Field id={`variant-extra-${i}`} label="Extra price" type="number" inputMode="decimal" min="0" step="0.01" value={v.extra_price} onChange={setVariant(i, 'extra_price')} />
              <button type="button" onClick={() => removeVariant(i)} className="rounded-full border border-line px-3 py-2.5 text-sm font-medium hover:bg-white/10">
                Remove<span className="sr-only"> variant {i + 1}</span>
              </button>
              {v.attribute && v.value && Number(v.extra_price) >= 0 && values.sales_price !== '' && (
                <p className="text-sm text-muted sm:col-span-4">
                  {v.attribute}: {v.value} sells at {formatMoney(Number(values.sales_price) + Number(v.extra_price || 0))}.
                </p>
              )}
            </div>
          ))}
          {errors.variants && <p className="mb-3 text-sm text-danger">{errors.variants}</p>}
          <button type="button" onClick={addVariant} className="rounded-full border border-line px-4 py-2 font-medium hover:bg-white/10">
            Add variant
          </button>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={saving} loadingText="Saving…" className="w-auto!">
            {editing ? 'Save changes' : 'Add product'}
          </Button>
          <Link to="/products" className="rounded-full border border-line px-4 py-2.5 font-semibold hover:bg-white/10">Cancel</Link>
          {editing && <DeleteButton label="Delete product" busy={saving} onConfirm={onDelete} />}
        </div>
      </form>
    </>
  );
}
