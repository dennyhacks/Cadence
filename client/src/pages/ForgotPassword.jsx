import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import AuthLayout from '../components/AuthLayout.jsx';
import { Field } from '../components/Field.jsx';
import { Button, ErrorAlert, Notice, linkClass } from '../components/ui.jsx';
import { validateEmail } from '../validation.js';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setFormError('');
    const problem = validateEmail(email);
    setError(problem);
    if (problem) return;

    setBusy(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      setSentTo(email.trim());
    } catch (err) {
      setError(err.errors?.email || '');
      setFormError(err.errors ? '' : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your email and we'll send you a link to choose a new one."
      footer={
        <p>
          Remembered it?{' '}
          <Link to="/login" className={linkClass}>
            Back to sign in
          </Link>
        </p>
      }
    >
      {sentTo ? (
        <div className="grid gap-5">
          <Notice>
            If an account exists for <strong className="font-semibold">{sentTo}</strong>, a reset link is on its way.
            The link works once and expires in 60 minutes.
          </Notice>
          <button
            type="button"
            onClick={() => {
              setSentTo('');
              setEmail('');
            }}
            className={`justify-self-start text-sm ${linkClass}`}
          >
            Use a different email
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="grid gap-5">
          <ErrorAlert>{formError}</ErrorAlert>
          <Field
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError('');
            }}
            error={error}
          />
          <Button type="submit" loading={busy} loadingText="Sending link…">
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
