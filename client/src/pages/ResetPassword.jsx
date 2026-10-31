import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import AuthLayout from '../components/AuthLayout.jsx';
import { PasswordField } from '../components/Field.jsx';
import PasswordRules from '../components/PasswordRules.jsx';
import { Button, ErrorAlert, linkClass } from '../components/ui.jsx';
import { compact, validateConfirm, validateNewPassword } from '../validation.js';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();

  // 'checking' while we ask the server if the link still works, then 'valid' or 'invalid'.
  const [linkState, setLinkState] = useState(token ? 'checking' : 'invalid');
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .get(`/auth/reset-password/validate?token=${encodeURIComponent(token)}`)
      .then((data) => setLinkState(data.valid ? 'valid' : 'invalid'))
      .catch(() => setLinkState('invalid'));
  }, [token]);

  const set = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  async function onSubmit(e) {
    e.preventDefault();
    setFormError('');
    const found = compact({
      password: validateNewPassword(form.password),
      confirm: validateConfirm(form.password, form.confirm),
    });
    setErrors(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      await api.post('/auth/reset-password', { token, password: form.password });
      navigate('/login', { replace: true, state: { notice: 'Password updated. Sign in with your new password.' } });
    } catch (err) {
      if (err.status === 400 && !err.errors) setLinkState('invalid');
      setErrors(compact(err.errors || {}));
      setFormError(err.errors ? '' : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle={linkState === 'valid' ? 'Pick something you have not used on Cadence before.' : undefined}
      footer={
        <p>
          <Link to="/login" className={linkClass}>
            Back to sign in
          </Link>
        </p>
      }
    >
      {linkState === 'checking' && (
        <p role="status" className="text-muted">
          Checking your link…
        </p>
      )}

      {linkState === 'invalid' && (
        <div className="grid gap-4">
          <ErrorAlert>This reset link is invalid or has expired.</ErrorAlert>
          <Link to="/forgot-password" className={`text-sm ${linkClass}`}>
            Request a new reset link
          </Link>
        </div>
      )}

      {linkState === 'valid' && (
        <form onSubmit={onSubmit} noValidate className="grid gap-5">
          <ErrorAlert>{formError}</ErrorAlert>
          <div>
            <PasswordField
              id="password"
              label="New password"
              autoComplete="new-password"
              value={form.password}
              onChange={set('password')}
              error={errors.password}
            />
            <PasswordRules value={form.password} />
          </div>
          <PasswordField
            id="confirm"
            label="Confirm new password"
            autoComplete="new-password"
            value={form.confirm}
            onChange={set('confirm')}
            error={errors.confirm}
          />
          <Button type="submit" loading={busy} loadingText="Saving…">
            Save new password
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
