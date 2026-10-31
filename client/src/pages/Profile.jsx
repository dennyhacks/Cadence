import { useEffect, useState } from 'react';
import { api, ApiError } from '../api.js';
import { Button, ErrorAlert, Notice } from '../components/ui.jsx';
import { Field, Textarea } from '../components/Field.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useTitle } from '../useTitle.js';

export default function Profile() {
  useTitle('My details');
  const [values, setValues] = useState({ name: '', company: '', phone: '', billing_address: '' });
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saved, setSaved] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get('/profile')
      .then(({ profile: p }) => {
        setEmail(p.email);
        setValues({ name: p.name, company: p.company, phone: p.phone, billing_address: p.billing_address });
      })
      .catch((e) => setFormError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const set = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
    setSaved('');
  };

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    setSaved('');
    try {
      await api.put('/profile', values);
      setSaved('Your details are saved. New invoices will use them.');
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors);
      else setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-muted">Loading your details…</p>;

  return (
    <>
      <PageHeader title="My details">These appear as "billed to" on your invoices. Invoices already issued keep the details they were made with.</PageHeader>
      <form onSubmit={onSubmit} noValidate className="max-w-xl space-y-5">
        <Notice>{saved}</Notice>
        <ErrorAlert>{formError}</ErrorAlert>
        <Field id="name" label="Name" value={values.name} onChange={set('name')} error={errors.name} autoComplete="name" />
        <Field id="email" label="Email" value={email} disabled hint="Your sign-in address. It cannot be changed here." />
        <Field id="company" label="Company" value={values.company} onChange={set('company')} error={errors.company} autoComplete="organization" />
        <Field id="phone" label="Phone" type="tel" value={values.phone} onChange={set('phone')} error={errors.phone} autoComplete="tel" hint="For example +91 98765 43210." />
        <Textarea id="billing_address" label="Billing address" value={values.billing_address} onChange={set('billing_address')} error={errors.billing_address} />
        <Button type="submit" loading={saving} loadingText="Saving…" className="w-auto!">
          Save details
        </Button>
      </form>
    </>
  );
}
