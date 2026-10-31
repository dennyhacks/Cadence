export function Button({ loading = false, loadingText, children, className = '', ...props }) {
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={`flex w-full items-center justify-center gap-2 rounded-full bg-leaf-600 px-4 py-2.5 text-base font-semibold text-black transition-colors hover:bg-leaf-700 disabled:cursor-not-allowed disabled:opacity-70 ${className}`}
    >
      {loading && (
        <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )}
      {loading ? loadingText : children}
    </button>
  );
}

export function ErrorAlert({ children }) {
  if (!children) return null;
  return (
    <div role="alert" className="rounded-lg border border-danger/30 bg-danger-bg px-3.5 py-3 text-sm text-danger">
      {children}
    </div>
  );
}

export function Notice({ children }) {
  if (!children) return null;
  return (
    <div role="status" className="rounded-lg border border-leaf-600/30 bg-leaf-50 px-3.5 py-3 text-sm text-leaf-700">
      {children}
    </div>
  );
}

export const linkClass = 'font-medium text-leaf-700 underline-offset-2 hover:underline';
