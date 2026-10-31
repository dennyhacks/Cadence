import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import AuthLayout from '../components/AuthLayout.jsx';
import { Field, PasswordField } from '../components/Field.jsx';
import PasswordRules from '../components/PasswordRules.jsx';
import { Button, ErrorAlert, linkClass } from '../components/ui.jsx';
import { compact, validateConfirm, validateEmail, validateName, validateNewPassword } from '../validation.js';

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
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
      name: validateName(form.name),
      email: validateEmail(form.email),
      password: validateNewPassword(form.password),
      confirm: validateConfirm(form.password, form.confirm),
    });
    setErrors(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      await signup({ name: form.name.trim(), email: form.email.trim(), password: form.password });
      navigate('/', { replace: true });
    } catch (err) {
      setErrors(compact(err.errors || {}));
      setFormError(err.errors ? '' : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Sign up to see and manage your subscriptions and invoices."
      footer={
        <p>
          Already have an account?{' '}
          <Link to="/login" className={linkClass}>
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-5">
        <ErrorAlert>{formError}</ErrorAlert>

        <Field
          id="name"
          label="Full name"
          autoComplete="name"
          value={form.name}
          onChange={set('name')}
          error={errors.name}
        />
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
        <div>
          <PasswordField
            id="password"
            label="Password"
            autoComplete="new-password"
            value={form.password}
            onChange={set('password')}
            error={errors.password}
          />
          <PasswordRules value={form.password} />
        </div>
        <PasswordField
          id="confirm"
          label="Confirm password"
          autoComplete="new-password"
          value={form.confirm}
          onChange={set('confirm')}
          error={errors.confirm}
        />

        <Button type="submit" loading={busy} loadingText="Creating account…">
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
