import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api.js';
import { Button, ErrorAlert } from '../components/ui.jsx';
import { Checkbox, Field } from '../components/Field.jsx';
import PageHeader from '../components/PageHeader.jsx';
import DeleteButton from '../components/DeleteButton.jsx';
import { toNumber } from '../format.js';
import { useTitle } from '../useTitle.js';

export default function TaxForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  useTitle(editing ? 'Edit tax' : 'New tax');
  const navigate = useNavigate();
  const [values, setValues] = useState({ name: '', rate: '', apply_automatically: false });
  const [loading, setLoading] = useState(editing);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) return;
    api
      .get(`/taxes/${id}`)
      .then(({ tax }) => setValues({ name: tax.name, rate: String(tax.rate), apply_automatically: tax.apply_automatically }))
      .catch((e) => setFormError(e.message))
      .finally(() => setLoading(false));
  }, [editing, id]);

  const set = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  async function onSubmit(e) {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    const body = { name: values.name, rate: toNumber(values.rate), apply_automatically: values.apply_automatically };
    try {
      await (editing ? api.put(`/taxes/${id}`, body) : api.post('/taxes', body));
      navigate('/taxes');
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors);
      else setFormError(err.message);
      setSaving(false);
    }
  }

  async function onDelete() {
    setSaving(true);
    try {
      await api.del(`/taxes/${id}`);
      navigate('/taxes');
    } catch (err) {
      setFormError(err.message);
      setSaving(false);
    }
  }

  if (loading) return <p className="text-muted">Loading tax…</p>;

  return (
    <>
      <PageHeader title={editing ? 'Edit tax' : 'Add tax'} />
      <form onSubmit={onSubmit} noValidate className="max-w-md space-y-5">
        <ErrorAlert>{formError}</ErrorAlert>
        <Field id="name" label="Name" value={values.name} onChange={set('name')} error={errors.name} />
        <Field id="rate" label="Rate (%)" type="number" inputMode="decimal" min="0" max="100" step="0.01" value={values.rate} onChange={set('rate')} error={errors.rate} hint="For example, 18 for 18%." />
        <Checkbox id="apply_automatically" label="Apply automatically" hint="Added to every new subscription and template line, so nobody has to remember it. It can still be unticked on a single line." checked={values.apply_automatically} onChange={set('apply_automatically')} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={saving} loadingText="Saving…" className="w-auto!">
            {editing ? 'Save changes' : 'Add tax'}
          </Button>
          <Link to="/taxes" className="rounded-lg border border-line px-4 py-2.5 font-semibold hover:bg-paper">Cancel</Link>
          {editing && <DeleteButton label="Delete tax" busy={saving} onConfirm={onDelete} />}
        </div>
      </form>
    </>
  );
}
