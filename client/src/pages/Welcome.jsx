import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import Logo from '../components/Logo.jsx';
import CycleDial from '../components/CycleDial.jsx';
import Icon from '../components/Icon.jsx';
import PixelCity from '../components/PixelCity.jsx';
import { CountUp, CursorRing, ModuleTour, Tilt, useReveal, useSpotlight } from '../components/landing.jsx';

// The public front page: what Cadence is, what it does, and a way in. Everything here is explanation and
// illustration. The real data lives behind the sign-in.

const pill = 'inline-flex items-center rounded-full px-5 py-2.5 font-semibold transition-colors';
const primary = `${pill} bg-leaf-600 text-black hover:bg-leaf-700`;
const outline = `${pill} border border-white/25 text-white hover:bg-white/10`;

const PROBLEMS = [
  ['Customers live in a spreadsheet', 'Renewals are remembered by whoever notices first, so some are missed.'],
  ['Invoices are typed by hand', 'Every month, line by line, and a wrong number goes out.'],
  ['Payments are matched by scrolling', 'Bank statements against invoices, one at a time.'],
  ['Reports are built at quarter end', 'Nobody can say how much recurring revenue there really is.'],
];

const STEPS = [
  ['Set up', 'The admin adds products with variants, plans that bill daily, weekly, monthly or yearly, plus taxes and discounts.'],
  ['Sell', 'Start from a quotation template, turn it into a subscription, and move it from Draft to Quotation, Confirmed, Active and Closed.'],
  ['Bill', 'Invoices are created from active subscriptions by themselves, with taxes and discounts already worked out. Nothing is billed twice.'],
  ['Get paid', 'Customers pay online or the team records the payment. Paid, outstanding and overdue are always visible.'],
];

const FEATURES = [
  ['box', 'Products and variants', 'Name, type, prices, notes, and variants such as Brand: Odoo adding 560.'],
  ['cycle', 'Flexible plans', 'Daily to yearly billing, minimum quantity, dates, and per-plan rules to close, pause or renew.'],
  ['doc', 'Quotation templates', 'A ready-made offer with a plan and product lines, valid for a set number of days.'],
  ['repeat', 'Subscription lifecycle', 'Its own number, customer, dates, payment terms and lines, with a status everyone can see.'],
  ['receipt', 'Automatic invoices', 'Created each period with customer details, lines and totals, then confirmed, sent and printed.'],
  ['percent', 'Taxes and discounts', 'Admin rules, calculated automatically. Discounts apply on their own and stop when used up.'],
  ['wallet', 'Payments and overdue', 'Method, amount, date and note against the right invoice, with reminders for late ones.'],
  ['home', 'Finance dashboard', 'Active subscriptions, revenue, collected, outstanding and overdue, with filters.'],
];

const ROLES = [
  ['Admin', 'Controls the whole system: products, plans, taxes, discounts, and who joins the team.'],
  ['Staff', 'Handles customers day to day: quotations, subscriptions, invoices and payments.'],
  ['Customer', 'Signs up on their own, sees only their subscriptions and invoices, and pays online.'],
];

const STATS = [
  [4, 'billing periods', 'daily, weekly, monthly, yearly'],
  [1, 'invoice per period', 'enforced by the database, never twice'],
  [3, 'roles', 'admin, staff and customer'],
  [20000, 'subscriptions tested', 'every page answers in under 2 seconds'],
];

/** A picture of the product, drawn in HTML. It is decorative, so assistive technology skips it. */
function ProductPreview() {
  const rows = [
    ['INV-00012', 'Northwind Traders', 'Paid', '₹3,689.72', 'bg-[#d8fd34] text-black'],
    ['INV-00013', 'Kite Studio', 'Confirmed', '₹4,355.00', 'bg-black/10 text-black'],
    ['INV-00014', 'Orbit Labs', 'Overdue', '₹18,498.20', 'bg-[#ffd9d4] text-[#b3382c]'],
    ['INV-00015', 'Northwind Traders', 'Draft', '₹3,689.72', 'bg-black/5 text-black/60'],
  ];
  return (
    <div aria-hidden="true" className="relative mx-auto mt-16 max-w-4xl px-2 sm:px-0">
      <div className="rounded-3xl border border-white/10 bg-[#f4f4f2] p-4 text-black shadow-[0_30px_120px_-30px_rgba(216,253,52,0.35)] sm:p-6">
        <div className="flex items-center justify-between">
          <p className="font-display text-lg font-semibold">Invoices</p>
          <div className="flex gap-1.5 text-xs font-medium">
            <span className="rounded-full bg-black px-3 py-1 text-white">All</span>
            <span className="rounded-full bg-black/10 px-3 py-1">Paid</span>
            <span className="hidden rounded-full bg-black/10 px-3 py-1 sm:inline">Overdue</span>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
          {[['Collected', '₹22,067.87'], ['Outstanding', '₹20,343.92'], ['Overdue', '₹20,343.92']].map(([k, v], i) => (
            <div key={k} className="rounded-2xl bg-white p-3 sm:p-4">
              <p className="text-[11px] text-black/50 sm:text-xs">{k}</p>
              <p className={`mt-1 font-display text-sm font-semibold sm:text-xl ${i === 2 ? 'text-[#b3382c]' : ''}`}>{v}</p>
            </div>
          ))}
        </div>
        <ul className="mt-4 divide-y divide-black/10 rounded-2xl bg-white">
          {rows.map(([n, c, s, a, tone]) => (
            <li key={n} className="flex items-center justify-between gap-3 px-3 py-3 text-sm sm:px-4">
              <span className="min-w-0">
                <span className="block font-semibold">{n}</span>
                <span className="block truncate text-xs text-black/50">{c}</span>
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>{s}</span>
              <span className="w-24 text-right font-medium sm:w-28">{a}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Floating pieces, like notifications arriving */}
      <div className="float-slow absolute -right-1 -top-8 w-60 rounded-2xl border border-white/10 bg-surface p-3.5 text-white shadow-2xl sm:-right-6 sm:w-64">
        <p className="flex items-center gap-2 text-xs text-muted">
          <span className="size-2 rounded-full bg-leaf-600" /> Payment received
        </p>
        <p className="mt-1 font-display text-lg font-semibold">₹1,845.72 · INV-00007</p>
        <p className="text-xs text-muted">Card, test mode. The invoice is now Paid.</p>
      </div>
      <div className="float-slower absolute -bottom-10 -left-1 hidden w-52 rounded-2xl border border-white/10 bg-surface p-3 text-white shadow-2xl sm:-left-8 sm:block">
        <CycleDial className="mx-auto w-full" />
      </div>
      <div className="float-slow absolute -bottom-6 right-2 rounded-full bg-leaf-600 px-4 py-2 text-sm font-semibold text-black shadow-2xl sm:right-10">
        Invoice sent to customer
      </div>
    </div>
  );
}

function Section({ id, title, children, className = '' }) {
  return (
    <section id={id} data-reveal className={`mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28 ${className}`}>
      <h2 className="max-w-3xl font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">{title}</h2>
      {children}
    </section>
  );
}

export default function Welcome() {
  const { user } = useAuth();
  const spotlight = useSpotlight();
  useReveal();

  useEffect(() => {
    document.title = 'Cadence · Subscription billing';
  }, []);

  return (
    <div className="min-h-screen overflow-x-clip bg-paper text-ink">
      <CursorRing />
      <a href="#story" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-leaf-600 focus:px-4 focus:py-2 focus:text-black">
        Skip to the story
      </a>

      <header className="fixed inset-x-0 top-3 z-40 px-3 sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 rounded-full border border-white/10 bg-paper/70 px-4 py-2 backdrop-blur-xl sm:px-6">
          <Link to="/welcome" aria-label="Cadence, subscription billing, home"><Logo light /></Link>
          <nav aria-label="Page sections" className="hidden items-center gap-7 text-sm text-pine-200 md:flex">
            <a href="#problem" className="hover:text-white">The problem</a>
            <a href="#how" className="hover:text-white">How it works</a>
            <a href="#features" className="hover:text-white">Features</a>
            <a href="#roles" className="hover:text-white">Who it is for</a>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <Link to="/" className={`${primary} py-2 text-sm`}>Open Cadence</Link>
            ) : (
              <>
                <Link to="/login" className="hidden rounded-full px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 sm:inline-flex">Sign in</Link>
                <Link to="/signup" className={`${primary} py-2 text-sm`}>Get started</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="story">
        {/* Hero */}
        <div className="grid-bg hero-glow relative">
          <div className="mx-auto max-w-6xl px-5 pb-24 pt-32 text-center sm:px-8 sm:pb-32 sm:pt-44">
            <h1 className="mx-auto max-w-4xl font-display text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
              Recurring revenue that runs <span className="text-leaf-600">itself.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-pine-200 sm:text-xl">
              Plans, subscriptions, invoices and payments in one place. Cadence bills every customer on time, applies the right taxes
              and discounts, and shows exactly how much recurring revenue you have.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              {user ? (
                <Link to="/" className={`${primary} px-7 py-3 text-lg`}>Open Cadence</Link>
              ) : (
                <>
                  <Link to="/login" data-cursor="Go" className={`${primary} px-7 py-3 text-lg`}>Sign in</Link>
                  <Link to="/signup" data-cursor="Join" className={`${outline} px-7 py-3 text-lg`}>Create an account</Link>
                </>
              )}
            </div>
            <Tilt className="mx-auto max-w-4xl">
              <ProductPreview />
            </Tilt>
          </div>
        </div>

        {/* The problem */}
        <Section id="problem" title="This is a billing month at most companies today.">
          <ul className="mt-12 grid gap-4 sm:grid-cols-2">
            {PROBLEMS.map(([title, text], i) => (
              <li key={title} className="rounded-3xl border border-line bg-surface p-6">
                <span className="grid size-9 place-items-center rounded-full bg-danger-bg font-display font-semibold text-danger" aria-hidden="true">{i + 1}</span>
                <h3 className="mt-4 font-display text-xl font-semibold">{title}</h3>
                <p className="mt-1.5 text-muted">{text}</p>
              </li>
            ))}
          </ul>
          <p className="mt-10 max-w-3xl font-display text-2xl leading-snug text-pine-200 sm:text-3xl">
            Cadence replaces all of it with <span className="text-leaf-600">one system</span> that runs the whole life of a subscription.
          </p>
        </Section>

        {/* The tour */}
        <Section id="tour" title="Click through the product.">
          <p className="mt-4 max-w-2xl text-lg text-pine-200">Five screens that cover the whole life of a subscription. Pick one, or let it play.</p>
          <ModuleTour />
        </Section>

        {/* How it works */}
        <div className="border-y border-line bg-surface/60">
          <Section id="how" title="From first setup to the finance report, in four steps.">
            <ol className="mt-12 grid gap-4 md:grid-cols-4">
              {STEPS.map(([title, text], i) => (
                <li key={title} className="relative rounded-3xl border border-line bg-paper p-6">
                  <span className="font-display text-5xl font-semibold text-leaf-600" aria-hidden="true">0{i + 1}</span>
                  <h3 className="mt-3 font-display text-2xl font-semibold">{title}</h3>
                  <p className="mt-2 text-muted">{text}</p>
                </li>
              ))}
            </ol>
          </Section>
        </div>

        {/* Features */}
        <Section id="features" title="Everything a subscription business runs on.">
          <ul ref={spotlight} className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(([icon, title, text]) => (
              <li key={title} className="spotlight group rounded-3xl border border-line bg-surface p-6 transition-colors hover:border-leaf-600/60">
                <span className="grid size-11 place-items-center rounded-full bg-leaf-50 text-leaf-600">
                  <Icon name={icon} className="size-5" />
                </span>
                <h3 className="mt-5 font-display text-xl font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm text-muted">{text}</p>
              </li>
            ))}
          </ul>
        </Section>

        {/* Numbers */}
        <div className="border-y border-line" data-reveal>
          <div className="mx-auto grid max-w-6xl gap-px px-5 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
            {STATS.map(([big, label, note]) => (
              <div key={label} className="py-10 sm:px-6">
                <p className="font-display text-6xl font-semibold text-leaf-600"><CountUp to={big} /></p>
                <p className="mt-2 font-display text-xl font-semibold">{label}</p>
                <p className="mt-1 text-sm text-muted">{note}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Roles */}
        <Section id="roles" title="Everyone sees what they need, and nothing more.">
          <ul className="mt-12 grid gap-4 md:grid-cols-3">
            {ROLES.map(([role, text]) => (
              <li key={role} className="rounded-3xl border border-line bg-surface p-7">
                <span className="rounded-full bg-leaf-50 px-3 py-1 text-sm font-medium text-leaf-600">{role}</span>
                <p className="mt-5 text-lg">{text}</p>
              </li>
            ))}
          </ul>
        </Section>

        {/* The way in */}
        <section aria-labelledby="start-heading" data-reveal className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
          <div className="grid-bg relative overflow-hidden rounded-[2rem] bg-leaf-600 p-8 text-black sm:p-14">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.06)_1px,transparent_1px)] bg-[size:48px_48px]" aria-hidden="true" />
            <div className="relative max-w-2xl">
              <h2 id="start-heading" className="font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
                See your recurring revenue run itself.
              </h2>
              <p className="mt-4 text-lg text-black/70">Sign in to explore plans, subscriptions, invoices, payments and the finance dashboard.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                {user ? (
                  <Link to="/" className={`${pill} bg-black px-7 py-3 text-lg text-white hover:bg-black/80`}>Open Cadence</Link>
                ) : (
                  <>
                    <Link to="/login" className={`${pill} bg-black px-7 py-3 text-lg text-white hover:bg-black/80`}>Sign in</Link>
                    <Link to="/signup" className={`${pill} border border-black/30 px-7 py-3 text-lg text-black hover:bg-black/10`}>Create an account</Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        <PixelCity />
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-muted sm:px-8">
          <Logo light />
          <p>Subscription billing for Brightloop Software.</p>
          <p className="flex gap-5">
            <Link to="/login" className="hover:text-white">Sign in</Link>
            <Link to="/signup" className="hover:text-white">Create an account</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
