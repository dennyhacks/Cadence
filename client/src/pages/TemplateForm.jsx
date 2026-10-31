import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api.js';
import { Button, ErrorAlert } from '../components/ui.jsx';
import { Field, Select } from '../components/Field.jsx';
import PageHeader from '../components/PageHeader.jsx';
import DeleteButton from '../components/DeleteButton.jsx';
import LinesEditor, { automaticTaxIds, emptyLine, linesFromApi, linesToBody } from '../components/LinesEditor.jsx';
import { toNumber } from '../format.js';
import { useTitle } from '../useTitle.js';

export default function TemplateForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  useTitle(editing ? 'Edit template' : 'New template');
  const navigate = useNavigate();
  const [values, setValues] = useState({ name: '', plan_id: '', validity_days: '30' });
  const [lines, setLines] = useState([emptyLine()]);
  const [plans, setPlans] = useState([]);
  const [products, setProducts] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/plans'),
      api.get('/products?variants=1'),
      api.get('/taxes'),
      editing ? api.get(`/templates/${id}`) : null,
    ])
      .then(([p, pr, t, tpl]) => {
        setPlans(p.plans);
        setProducts(pr.products);
        setTaxes(t.taxes);
        if (!tpl) setLines([emptyLine(automaticTaxIds(t.taxes))]);
        if (tpl) {
          const x = tpl.template;
          setValues({ name: x.name, plan_id: String(x.plan_id), validity_days: String(x.validity_days) });
          setLines(linesFromApi(x.lines));
        }
      })
      .catch((e) => setFormError(e.message))
      .finally(() => setLoading(false));
  }, [editing, id]);

  const set = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  async function onSubmit(e) {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    const body = {
      name: values.name,
      plan_id: values.plan_id === '' ? undefined : Number(values.plan_id),
      validity_days: toNumber(values.validity_days),
      lines: linesToBody(lines),
    };
    try {
      await (editing ? api.put(`/templates/${id}`, body) : api.post('/templates', body));
      navigate('/templates');
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors);
      else setFormError(err.message);
      setSaving(false);
    }
  }

  async function onDelete() {
    setSaving(true);
    try {
      await api.del(`/templates/${id}`);
      navigate('/templates');
    } catch (err) {
      setFormError(err.message);
      setSaving(false);
    }
  }

  if (loading) return <p className="text-muted">Loading template…</p>;

  return (
    <>
      <PageHeader title={editing ? 'Edit template' : 'Add template'} />
      <form onSubmit={onSubmit} noValidate className="max-w-3xl space-y-5">
        <ErrorAlert>{formError}</ErrorAlert>
        <Field id="name" label="Name" value={values.name} onChange={set('name')} error={errors.name} />
        <div className="grid gap-5 sm:grid-cols-2">
          <Select id="plan_id" label="Plan" value={values.plan_id} onChange={set('plan_id')} error={errors.plan_id}>
            <option value="">Choose a plan</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
          <Field id="validity_days" label="Quote is valid for (days)" type="number" inputMode="numeric" min="1" max="365" step="1" value={values.validity_days} onChange={set('validity_days')} error={errors.validity_days} />
        </div>
        <LinesEditor lines={lines} onChange={(l) => { setLines(l); setErrors((p) => ({ ...p, lines: undefined })); }} products={products} taxes={taxes} error={errors.lines} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={saving} loadingText="Saving…" className="w-auto!">
            {editing ? 'Save changes' : 'Add template'}
          </Button>
          <Link to="/templates" className="rounded-full border border-line px-4 py-2.5 font-semibold hover:bg-white/10">Cancel</Link>
          {editing && <DeleteButton label="Delete template" busy={saving} onConfirm={onDelete} />}
        </div>
      </form>
    </>
  );
}
