import { useEffect } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import Logo from '../components/Logo.jsx';

const ROLE_LABEL = { admin: 'Admin', staff: 'Staff', customer: 'Customer' };

// Placeholder landing page. The real dashboard replaces this in the next phase.
export default function Home() {
  const { user, logout } = useAuth();

  useEffect(() => {
    document.title = 'Cadence';
  }, []);

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between bg-pine-900 px-6 py-4 text-white">
        <Logo light />
        <div className="flex items-center gap-4 text-sm">
          <span className="hidden sm:inline">{user.name}</span>
          <span className="rounded-full bg-pine-800 px-2.5 py-0.5 text-pine-200">{ROLE_LABEL[user.role]}</span>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg border border-pine-700 px-3 py-1.5 font-medium hover:bg-pine-800"
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-14">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Welcome, {user.name.split(' ')[0]}</h1>
        <p className="mt-3 text-muted">
          You are signed in as {ROLE_LABEL[user.role].toLowerCase()}. The dashboard arrives in the next phase.
        </p>
      </main>
    </div>
  );
}
