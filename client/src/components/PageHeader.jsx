export default function PageHeader({ title, children }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      {children && <p className="mt-1.5 max-w-2xl text-muted">{children}</p>}
    </div>
  );
}
