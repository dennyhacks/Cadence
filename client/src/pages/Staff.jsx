import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api.js';
import { Button, ErrorAlert, Notice } from '../components/ui.jsx';
import { Field, PasswordField } from '../components/Field.jsx';
import PasswordRules from '../components/PasswordRules.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { validateName, validateEmail, validateNewPassword } from '../validation.js';
import { useTitle } from '../useTitle.js';

const formatDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export default function Staff() {
  useTitle('Staff');
  const [staff, setStaff] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [added, setAdded] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api
      .get('/users?role=staff')
      .then((data) => setStaff(data.users))
      .catch((err) => setLoadError(err.message));
  }, []);
  useEffect(load, [load]);

  const set = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  async function onSubmit(e) {
    e.preventDefault();
    setAdded('');
    setFormError('');
    const found = {
      name: validateName(values.name),
      email: validateEmail(values.email),
      password: validateNewPassword(values.password),
    };
    if (Object.values(found).some(Boolean)) {
      setErrors(found);
      return;
    }
    setSaving(true);
    try {
      await api.post('/users/staff', values);
      setAdded(`${values.name.trim()} can now sign in as staff.`);
      setValues({ name: '', email: '', password: '' });
      setErrors({});
      load();
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors);
      else setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Staff">Staff accounts can manage products, plans, subscriptions, invoices and payments.</PageHeader>
      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <section aria-labelledby="staff-list">
          <h2 id="staff-list" className="mb-3 font-display text-lg font-semibold">
            Current staff
          </h2>
          <ErrorAlert>{loadError}</ErrorAlert>
          {!loadError && staff === null && <p className="text-muted">Loading staff…</p>}
          {staff?.length === 0 && <p className="text-muted">No staff yet. Add the first one.</p>}
          {staff?.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">Name</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Email</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Added</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((s) => (
                    <tr key={s.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-3 font-medium">{s.name}</td>
                      <td className="px-4 py-3">{s.email}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDate(s.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="staff-add" className="h-fit rounded-2xl border border-line bg-surface p-5">
          <h2 id="staff-add" className="mb-4 font-display text-lg font-semibold">
            Add a staff member
          </h2>
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <Notice>{added}</Notice>
            <ErrorAlert>{formError}</ErrorAlert>
            <Field id="staff-name" label="Full name" autoComplete="off" value={values.name} onChange={set('name')} error={errors.name} />
            <Field id="staff-email" label="Email" type="email" autoComplete="off" value={values.email} onChange={set('email')} error={errors.email} />
            <PasswordField id="staff-password" label="Temporary password" autoComplete="new-password" value={values.password} onChange={set('password')} error={errors.password} />
            <PasswordRules value={values.password} />
            <Button type="submit" loading={saving} loadingText="Adding…">
              Add staff member
            </Button>
          </form>
        </section>
      </div>
    </>
  );
}
