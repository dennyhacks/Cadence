# Cadence: working notes for Claude

Read this first. It holds the owner's rules, the decisions already made and the plan.

## What this is

Cadence is a subscription management system for Brightloop Software, built solo for an Odoo hackathon. The brief is `docs/Subscription_Management_System.pdf`. It is the source of truth: follow it word for word and add no extra features unless the owner asks.

- Owner: Denny (solo team)
- GitHub: `dennyhacks/Cadence`
- Deadline: 4pm IST, Saturday 31 October 2026

## Owner's rules (never break these)

1. **Never push to `main`** until everything is finished and the owner says so. Work on named feature branches (`feature/login`, `feature/dashboard`, and so on).
2. **Push to GitHub about every 30 minutes**, even if the feature is unfinished. When it is finished, push the final version to the same branch (overwrite).
3. **Work in phases, one at a time:** login, then dashboard shell, then the functionality inside it. Do not start a phase until the owner says "go".
4. **Ask doubts before starting a phase.** Do not invent features that are not in the brief.
5. **Backend is MySQL**, including auth. No Supabase or other hosted backend.
6. **Demo data for testing only** (the seed script).
7. **No wireframe exists.** Design the UI properly and keep it consistent.
8. **Hackathon must-haves:** real data from the database (no static JSON), responsive and clean UI with one color scheme, robust input validation, intuitive navigation with good menu placement and spacing, proper git use. **Nice to have:** well-designed backend APIs, a local database, understanding any code before using it, working offline, trendy tech only when it adds real value.

## Stack and decisions already made

- **Server:** Node 22, Express 5, `mysql2` with plain SQL migrations (not Prisma, which needs binary downloads), zod 4 for validation, bcryptjs, JWT in an httpOnly cookie named `cadence_token`, nodemailer.
- **Client:** React 19, React Router 7, Vite, Tailwind 4 (theme tokens live in `client/src/index.css` under `@theme`). Fonts come from `@fontsource-variable` packages so it works offline.
- **Dev setup:** Vite proxies `/api` to the Express server on port 4000, so everything is one origin.
- **API errors** look like `{ message, errors: { field: 'message' } }`. Use `HttpError` and `parse(schema, body)` from `server/src/utils/errors.js` and `server/src/validation/schemas.js`.
- **Roles:** `admin`, `staff`, `customer`. Guard routes with `requireRole(...)` from `server/src/middleware/auth.js`. On the client use `ProtectedRoute roles={[...]}`.
- **Migrations:** add `server/db/migrations/00N_name.sql`. The runner applies new files in order. `npm run db:reset` drops everything, migrates and reseeds.
- **Seed data:** `server/db/seed.js`, idempotent. Extend it every phase so each screen has demo data.
- **Dates** are stored in UTC.
- **Password rules (from the brief):** more than 8 characters, an uppercase letter, a lowercase letter, a special character. Defined in both `server/src/validation/schemas.js` and `client/src/validation.js`; keep them in sync.
- **Tests:** API tests in `server/test/*.test.js` (node:test, real database). Add tests with each phase.

## Design system

- **Colors:** pine `#0C332F` (brand), leaf `#0E7C6B` (actions), paper `#F2F5F3` (background), ink `#14201E` (text), muted `#55655F`, line `#D3DDD8`, signal `#E3A72F` (use sparingly), danger `#B3382C`.
- **Type:** Bricolage Grotesque for headings (`font-display`), Instrument Sans for body (`font-sans`).
- **Look:** no shadowed card stacks, no all-caps eyebrow labels. Reuse `Field`, `PasswordField`, `Button`, `ErrorAlert`, `Notice` from `client/src/components`.
- **Copy:** sentence case, plain verbs. Buttons say what they do ("Save changes"). Errors say what went wrong and how to fix it.
- **Quality floor:** responsive down to 390px wide, visible keyboard focus, labels on every input, respect reduced motion.

## Run it

```bash
npm run setup        # install everything
# copy server/.env.example to server/.env and set DB_USER / DB_PASSWORD
npm run db:setup     # tables and demo data
npm run dev          # API on 4000, app on 5173
npm test             # API tests
```

Demo accounts: `admin@cadence.test` / `Admin@12345`, `staff@cadence.test` / `Staff@12345`, `customer@cadence.test` / `Customer@12345`. Extra demo customers: `kite@cadence.test` and `orbit@cadence.test`, both `Customer@12345`.

## If you are running in a Claude cloud workspace

There is no MySQL by default. Install MariaDB (MySQL-compatible) and test against it:

```bash
apt-get update && apt-get install -y mariadb-server
mkdir -p /run/mysqld && chown mysql:mysql /run/mysqld
nohup mysqld_safe > /tmp/mariadb.log 2>&1 &
mysql -e "CREATE DATABASE IF NOT EXISTS cadence; CREATE USER IF NOT EXISTS 'cadence'@'localhost' IDENTIFIED BY 'cadence123'; CREATE USER IF NOT EXISTS 'cadence'@'127.0.0.1' IDENTIFIED BY 'cadence123'; GRANT ALL ON cadence.* TO 'cadence'@'localhost'; GRANT ALL ON cadence.* TO 'cadence'@'127.0.0.1'; FLUSH PRIVILEGES;"
```

Then create `server/.env` (it is gitignored) with `DB_USER=cadence`, `DB_PASSWORD=cadence123`, `DB_NAME=cadence`, `JWT_SECRET=local-test-secret` and `BCRYPT_ROUNDS=4`, and run `npm run db:setup`. Background processes stop a few minutes after a reply ends, so restart them when you resume.

To check the UI, install `puppeteer-core` and `@sparticuz/chromium` outside the repo and take screenshots. Notes from last time: use one browser context (clear cookies between scenarios), triple-click does not select text in password fields (select all with Ctrl+A then Backspace), and wait for conditions instead of fixed sleeps. Always reseed (`npm run db:reset`) after tests that change demo users.

## Status and plan

Branches on GitHub: `setup/init` (README only), `feature/login`, `feature/dashboard`, `feature/products-plans`, `feature/taxes-discounts`, `feature/subscriptions`, `feature/invoices`, `feature/finance-dashboard` and `feature/polish`. Nothing is on `main` yet.

- [x] **Phase 1, login (`feature/login`):** sign in, sign up, forgot and reset password (emailed link, printed to the console without SMTP), roles, admin-only staff creation API (`POST /api/users/staff`, `GET /api/users`), placeholder landing page at `/`.
- [x] **Phase 2, dashboard shell (`feature/dashboard`):** sidebar and top bar with a different menu per role (`client/src/layout/nav.js`), admin Staff screen (list and add, `GET /api/users?role=staff`), customer portal frame (Subscriptions and Invoices only). Later-phase screens are `Section` placeholders; replace them with real pages in their phase and keep the same routes.
- [x] **Phase 3, products and plans (`feature/products-plans`, branched from `feature/dashboard`):** API at `/api/products` and `/api/plans` (admin and staff, full CRUD, variants add a fixed extra price), screens `/products` and `/plans` with add and edit forms, demo products and plans in the seed. Money shows as INR via `client/src/format.js`. Brief details:
  - Product: name, type, sales price, cost price, notes, and variants (for example by brand: choosing the Odoo brand adds 560 to the price).
  - Plan: price, billing period (daily, weekly, monthly or yearly), minimum quantity, and the dates it is available.
  - The admin decides plan by plan whether it closes on its own at the end date, can be closed early, paused or renewed.
- [x] **Phase 4, taxes and discounts (`feature/taxes-discounts`, branched from `feature/products-plans`):** `/api/taxes` (staff read, admin write) and `/api/discounts` (admin only), screens `/taxes` and `/discounts`, seeded rules. `server/src/utils/pricing.js` holds `discountStatus`, `discountApplies`, `discountAmount` and `priceLine` (whole-cent maths, tax on the amount after discount); use them for subscription lines and invoices in Phases 5 and 6, and increment `discounts.times_used` when an invoice uses one. Brief details:
  - Tax rules set by the admin, calculated automatically.
  - Discounts: admin only. A fixed amount or a percentage, with a minimum purchase or quantity, start and end dates, and a limit on how many times it can be used. Applies to specific products or whole subscriptions, appears on the next invoice on its own, and stops when it expires or runs out.
- [x] **Phase 5, quotation templates and subscriptions (`feature/subscriptions`, branched from `feature/taxes-discounts`):** `/api/templates`, `/api/subscriptions` (plus `/:id/action` and `/from-template`), `/api/customers`; screens `/templates`, `/subscriptions`, `/subscriptions/new`, `/subscriptions/:id`. Logic lives in `server/src/services/subscriptions.js`: unit price = product price + variant extra (server-side, never from the client), status flow Draft, Quotation, Confirmed, Active, Closed, plan rules (closable, pausable, renewable, auto_close, min quantity, availability window) enforced per action, and `closeExpiredSubscriptions()` runs at start-up and hourly. Customers see only their own non-draft subscriptions and can start one from a template, confirm it, and pause, resume, close or renew when the plan allows. The plan's price is added once per billing period on top of the lines, without tax; it is copied onto `subscriptions.plan_price` when the subscription is created or edited (invoices bill it without tax or discount). Brief details:
  - Quotation template: a plan and product lines, valid for a set number of days.
  - Subscription: its own number, customer, plan, start date, expiry date, payment terms, and lines (product, quantity, unit price, taxes, amount).
  - Status flows Draft, Quotation, Confirmed, Active, Closed, visible to everyone on the team.
  - Customers can manage their own subscriptions in the portal.
- [x] **Phase 6, invoices and payments (`feature/invoices`, branched from `feature/subscriptions`):** `/api/invoices` (list with paid, outstanding and overdue summary, detail, `/:id/action` confirm, cancel, send, `/:id/payments`, `/generate`) and `/api/payments`; screens `/invoices`, `/invoices/:id` (print view) and `/payments`. Billing lives in `server/src/services/billing.js` and the pure maths in `server/src/utils/invoicing.js`. Each subscription bills period `next_period_index` from its start date; billing starts when it is activated, skips periods while paused, and stops at the expiry date. The database guard is `UNIQUE (subscription_id, period_start)` on `invoices`. `server/src/index.js` runs the job at start-up and every hour (safe to repeat). Discounts apply on their own to product lines only (not the plan price), stack in order, and claim a use atomically; cancelling an invoice gives the use back. A cancelled period is not billed again. Payments are only accepted on confirmed invoices, never above the amount owed. Brief details:
  - Invoices are created from subscriptions automatically (customer details, lines, taxes and totals filled in). The team can confirm, cancel, send or print them. Status flows Draft, Confirmed, Paid.
  - Nothing billed twice or skipped: a daily job plus a manual "Generate due invoices" button, with a database-level guard against duplicates per subscription and period.
  - Payments recorded with method, amount, date and a note against the right invoice. Show paid versus outstanding, and overdue.
- [x] **Phase 7, finance dashboard (`feature/finance-dashboard`, branched from `feature/invoices`):** `GET /api/dashboard?from=&to=&plan_id=` (team only; all totals added up in SQL in `server/src/services/dashboard.js`) and the Overview page at `/` for admin and staff (period and plan filters kept in the URL, active subscriptions, invoiced, collected, outstanding, overdue, an invoiced-versus-collected bar chart with a table view, subscriptions by status, by plan, longest overdue, latest payments). Speed: `npm run db:seed:volume` (optionally `-- 20000`) loads thousands of subscriptions and invoices under `vol.N@cadence.test`, and `server/test/performance.test.js` then checks that every list and the dashboard answer in under two seconds (they take 2 to 110 ms at 20,000 subscriptions); `npm run db:reset` removes the volume data. Brief details: active subscriptions, revenue, payments and overdue invoices in one place, with filters and a summary view. Every page must respond in under two seconds with thousands of subscriptions, so use indexes, pagination and server-side aggregation.
- [x] **Finish, part 1 (`feature/polish`, branched from `feature/finance-dashboard`):** README rewritten for the whole system, demo data on every screen, a fresh clone checked (setup, build, tests).
- [ ] **Finish, part 2:** merge to `main` only when the owner says so. The seven feature branches form one chain (`feature/login` through `feature/polish`, each branched from the one before). `setup/init` has one extra commit (`.editorconfig`), so merge in order and expect no conflicts; the README on `feature/login` replaces the one-line README on `setup/init`.
