import { useState } from 'react';

export const inputClass = (hasError) =>
  `block w-full rounded-xl border bg-surface px-3.5 py-2.5 text-base text-ink transition-colors focus:outline-none focus:ring-2 ${
    hasError
      ? 'border-danger focus:ring-danger/25'
      : 'border-line hover:border-pine-300 focus:border-leaf-600 focus:ring-leaf-600/25'
  }`;

function FieldShell({ id, label, labelRight, error, hint, children }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {labelRight}
      </div>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

const describedBy = (id, error, hint) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined);

export function Field({ id, label, labelRight, error, hint, ...input }) {
  return (
    <FieldShell id={id} label={label} labelRight={labelRight} error={error} hint={hint}>
      <input
        id={id}
        name={id}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={inputClass(error)}
        {...input}
      />
    </FieldShell>
  );
}

export function PasswordField({ id, label, labelRight, error, hint, ...input }) {
  const [visible, setVisible] = useState(false);
  return (
    <FieldShell id={id} label={label} labelRight={labelRight} error={error} hint={hint}>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={visible ? 'text' : 'password'}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy(id, error, hint)}
          className={`${inputClass(error)} pr-16`}
          {...input}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 rounded-r-lg px-3.5 text-sm font-medium text-muted hover:text-leaf-700"
        >
          {visible ? 'Hide' : 'Show'}
          <span className="sr-only"> password</span>
        </button>
      </div>
    </FieldShell>
  );
}

export function Select({ id, label, error, hint, children, ...input }) {
  return (
    <FieldShell id={id} label={label} error={error} hint={hint}>
      <select
        id={id}
        name={id}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={inputClass(error)}
        {...input}
      >
        {children}
      </select>
    </FieldShell>
  );
}

export function Textarea({ id, label, error, hint, ...input }) {
  return (
    <FieldShell id={id} label={label} error={error} hint={hint}>
      <textarea
        id={id}
        name={id}
        rows={3}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={inputClass(error)}
        {...input}
      />
    </FieldShell>
  );
}

export function Checkbox({ id, label, hint, ...input }) {
  return (
    <div className="flex items-start gap-3">
      <input id={id} name={id} type="checkbox" className="mt-1 size-4 accent-leaf-600" {...input} />
      <label htmlFor={id} className="text-sm">
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-muted">{hint}</span>}
      </label>
    </div>
  );
}
