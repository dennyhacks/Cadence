import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import Logo from '../components/Logo.jsx';
import Icon from '../components/Icon.jsx';
import { navFor, ROLE_LABEL } from './nav.js';

const linkClass = ({ isActive }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] font-medium transition-colors ${
    isActive ? 'bg-pine-700 text-white' : 'text-pine-200 hover:bg-pine-800 hover:text-white'
  }`;

function Sidebar({ items, onNavigate }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-1 px-3">
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className={linkClass} onClick={onNavigate}>
          <Icon name={item.icon} />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const items = navFor(user.role);

  // Close the mobile menu when the route changes or Escape is pressed.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr] print:block">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="hidden bg-pine-900 py-5 lg:sticky lg:top-0 lg:block lg:h-screen lg:overflow-y-auto print:hidden">
        <Logo light className="mb-6 px-6" />
        <Sidebar items={items} />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden print:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-ink/50"
            onClick={() => setOpen(false)}
          />
          <aside
            id="mobile-menu"
            className="absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto bg-pine-900 py-5"
          >
            <div className="mb-6 flex items-center justify-between px-6">
              <Logo light />
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-pine-200 hover:bg-pine-800 hover:text-white"
              >
                <Icon name="close" />
              </button>
            </div>
            <Sidebar items={items} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-white/95 px-4 py-3 backdrop-blur sm:px-6 print:hidden">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Open menu"
              aria-expanded={open}
              aria-controls="mobile-menu"
              onClick={() => setOpen(true)}
              className="rounded-lg p-1.5 text-ink hover:bg-paper lg:hidden"
            >
              <Icon name="menu" />
            </button>
            <Logo className="lg:hidden" />
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="hidden text-right leading-tight sm:block">
              <p className="font-medium">{user.name}</p>
              <p className="text-muted">{user.email}</p>
            </div>
            <span className="rounded-full bg-leaf-50 px-2.5 py-0.5 font-medium text-leaf-700">
              {ROLE_LABEL[user.role]}
            </span>
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 font-medium hover:bg-paper"
            >
              <Icon name="signout" className="size-4" />
              <span className="hidden sm:inline">Sign out</span>
              <span className="sr-only sm:hidden">Sign out</span>
            </button>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 print:max-w-none print:p-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
