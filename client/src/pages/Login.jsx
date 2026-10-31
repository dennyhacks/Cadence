import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import AuthLayout from '../components/AuthLayout.jsx';
import { Field, PasswordField } from '../components/Field.jsx';
import { Button, ErrorAlert, Notice, linkClass } from '../components/ui.jsx';
import { compact, validateEmail } from '../validation.js';

// Demo accounts are created by `npm run db:setup`. They show up in development only.
const SHOW_DEMO = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_LOGINS === 'true';
const DEMO_ACCOUNTS = [
  { label: 'Admin', email: 'admin@cadence.test', password: 'Admin@12345' },
  { label: 'Staff', email: 'staff@cadence.test', password: 'Staff@12345' },
  { label: 'Customer', email: 'customer@cadence.test', password: 'Customer@12345' },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  async function onSubmit(e) {
    e.preventDefault();
    setFormError('');
    const found = compact({
      email: validateEmail(form.email),
      password: form.password ? '' : 'Enter your password.',
    });
    setErrors(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      await login(form.email.trim(), form.password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setErrors(compact(err.errors || {}));
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Sign in to Cadence"
      subtitle="Enter your email and password to continue."
      footer={
        <p>
          New to Cadence?{' '}
          <Link to="/signup" className={linkClass}>
            Create an account
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-5">
        <Notice>{location.state?.notice}</Notice>
        <ErrorAlert>{formError}</ErrorAlert>

        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={form.email}
          onChange={set('email')}
          error={errors.email}
        />
        <PasswordField
          id="password"
          label="Password"
          labelRight={
            <Link to="/forgot-password" className={`text-sm ${linkClass}`}>
              Forgot password?
            </Link>
          }
          autoComplete="current-password"
          value={form.password}
          onChange={set('password')}
          error={errors.password}
        />

        <Button type="submit" loading={busy} loadingText="Signing in…">
          Sign in
        </Button>
      </form>

      {SHOW_DEMO && (
        <div className="mt-8 border-t border-line pt-5">
          <p className="text-sm text-muted">Demo accounts: pick one to fill the form.</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.label}
                type="button"
                onClick={() => {
                  setForm({ email: account.email, password: account.password });
                  setErrors({});
                  setFormError('');
                }}
                className="rounded-full border border-line bg-surface px-3.5 py-1 text-sm font-medium hover:border-leaf-600 hover:text-leaf-700"
              >
                {account.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
