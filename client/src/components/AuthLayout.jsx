import { useEffect } from 'react';
import Logo from './Logo.jsx';
import CycleDial from './CycleDial.jsx';

/** The frame shared by sign in, sign up and password reset: brand panel on the left, form on the right. */
export default function AuthLayout({ title, subtitle, children, footer }) {
  useEffect(() => {
    document.title = `${title} · Cadence`;
  }, [title]);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="hidden flex-col justify-between grid-bg bg-pine-900 px-14 py-12 text-white lg:flex">
        <Logo light />
        <CycleDial className="mx-auto my-10 w-full max-w-[340px]" />
        <div>
          <span className="mb-5 inline-flex rounded-full border border-white/20 px-3.5 py-1 text-sm text-pine-200">Billing for Brightloop Software</span>
          <p className="max-w-md font-display text-4xl font-semibold leading-[1.1] tracking-tight">
            Every renewal, invoice and payment <span className="text-leaf-600">in one place.</span>
          </p>
          <p className="mt-4 max-w-sm text-pine-200">
            Cadence runs plans, subscriptions and billing for Brightloop Software.
          </p>
        </div>
      </aside>

      <header className="bg-pine-900 px-6 py-5 lg:hidden">
        <Logo light />
      </header>

      <main className="flex justify-center px-6 py-10 sm:px-10 lg:items-center lg:py-12">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-sm text-muted">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
