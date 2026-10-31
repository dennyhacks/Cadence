import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import AuthLayout from '../components/AuthLayout.jsx';
import { Field, PasswordField } from '../components/Field.jsx';
import { Button, ErrorAlert, Notice, linkClass } from '../components/ui.jsx';
import { compact, validateEmail } from '../validation.js';

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
    </AuthLayout>
  );
}
