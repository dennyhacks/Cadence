# Cadence

**Subscription billing that runs itself.** Cadence is a complete subscription management system for Brightloop Software: products and plans, quotations, subscriptions, automatic invoices, payments and a live finance dashboard, with a customer portal on top. Built solo for the Odoo hackathon.

### Live demo: https://cadence-odoo.vercel.app

Open it, sign in with any account below, and click around. Everything you see comes from a real MySQL database.

| Role | Email | Password | What you get |
| --- | --- | --- | --- |
| **Admin** | `admin@cadence.test` | `Admin@12345` | Everything, including taxes, discounts and staff |
| **Staff** | `staff@cadence.test` | `Staff@12345` | Catalogue, subscriptions, invoices, payments, dashboard |
| **Customer** | `customer@cadence.test` | `Customer@12345` | Their own subscriptions and invoices, and online payment |

Two more demo customers, `kite@cadence.test` and `orbit@cadence.test`, use `Customer@12345`. Anyone can also create a new customer account from **Sign up** (it asks for a company name).

**Test card for paying an invoice:** `4242 4242 4242 4242`, any future date, any 3 digits. It is test mode, so no money moves.

---

## Why it stands out

- **It cannot bill anyone twice.** The database itself allows one invoice per subscription and billing period, so even two billing runs at the same instant cannot create a duplicate. Missed periods are caught up automatically.
- **Prices can't be tampered with.** The server works out every price from the product and its variant. The browser never sends one.
- **Fast with real volume.** Every page answers in under two seconds with thousands of subscriptions. At **20,000 subscriptions and about 79,000 invoices the slowest page took about 110 ms**, because totals are added up in SQL, lists are paginated and the right columns are indexed.
- **Money is exact.** Whole-cent maths and `DECIMAL` storage, so totals never show floating point surprises.
- **Two payments at once can't overpay an invoice.** The invoice row is locked while a payment is recorded.
- **Tested against a real database.** 138 automated API tests pass, plus 18 speed tests that run on large data.
- **Customers only ever see their own data.** The server checks the role on every route and filters by the customer. Someone else's invoice simply answers "not found".

## Everything in the brief, done

| Area | What Cadence does |
| --- | --- |
| **Sign in** | Sign in, sign up, forgot and reset password by email (single-use link, 60 minutes), strong password rules checked in the browser and again on the server, three roles |
| **Products** | Name, type, sales price, cost price, notes, and variants (for example Brand: Odoo adds 560) |
| **Plans** | Price, billing period (daily, weekly, monthly, yearly), minimum quantity, availability dates, and per-plan rules for closing on its own, closing early, pausing and renewing |
| **Taxes** | Set by the admin, calculated automatically on the amount after discount, can apply to every new line |
| **Discounts** | Admin only. Fixed or percentage, minimum purchase or quantity, start and end dates, usage limit. Apply to products or whole subscriptions, show up on the next invoice by themselves, and stop when they expire or run out |
| **Quotation templates** | A plan and product lines, valid for a set number of days |
| **Subscriptions** | Own number, customer, plan, dates, payment terms and priced lines. Status flows Draft, Quotation, Confirmed, Active, Closed, visible to the whole team |
| **Customer portal** | Customers start a subscription from a template, confirm it, and pause, resume, close or renew when the plan allows |
| **Invoices** | Created automatically from active subscriptions with customer details, lines, taxes and totals. Confirm, cancel, send and print. Draft, Confirmed, Paid |
| **Payments** | Method, amount, date and note against the right invoice, with paid, outstanding and overdue totals |
| **Finance dashboard** | Active subscriptions, invoiced, collected, outstanding, overdue, charts, filters by period and plan, and a table view |
| **Quality** | Real database data, responsive down to phone width, one colour scheme, a clear message on every form field, role-based menus |

## Beyond the brief

- **Online payment.** `POST /api/invoices/:id/pay` accepts a card on a confirmed invoice in test mode. The card number is checked with the Luhn algorithm and the expiry against today's date, only the published test cards are approved, and the number is never stored (only the last four digits go in the payment note). The payment is recorded inside the same row-locked transaction as a manual one.
- **Overdue reminders.** A team action sends a reminder email with a link to the invoice. The billing job also sends them automatically, at most once every 7 days per invoice. Each invoice is claimed with a conditional `UPDATE` on `reminded_at` before sending, so concurrent runs cannot send twice, and the claim is rolled back if the send fails.
- **Recurring revenue.** Monthly recurring revenue is computed in SQL from active, unpaused subscriptions (plan price plus product lines, before tax) and normalised per billing period. It is shown with the yearly run rate, churn for the selected period, and a three-month forecast that assumes no change from today.
- **Search.** `GET /api/search` (team only) matches subscriptions, invoices, products and plans with parameterised, wildcard-escaped `LIKE` queries, up to five results per type.
- **CSV export.** Invoices (following the status filter) and payments export with formula-injection protection, so a cell starting with `=`, `+`, `-` or `@` cannot run in a spreadsheet.
- **Landing page.** A public front page with an interactive product tour and an SVG pixel-art street. It uses no data, runs only with a fine pointer, and respects `prefers-reduced-motion`.
- **Production deployment.** Vercel serverless functions (Tokyo region) with a hosted TiDB Cloud MySQL database, SMTP mail through nodemailer, and a daily cron job for billing and reminders.

## Take the 3 minute tour

1. **Admin:** open the **Overview**. Change the plan and period filters and watch the numbers move. Try the search box.
2. **Catalogue:** open a product with a variant, a plan (see its four rules), and the discounts page.
3. **Subscriptions:** create one from a template, then walk it through Send quotation, Confirm and Activate.
4. **Invoices:** press **Generate due invoices**. It tells you nothing is due, because nothing is billed twice. Open an overdue invoice, record a payment and print it.
5. **Customer:** sign out and sign in as the customer. See only their own data, and pay an invoice with the test card.
6. **Phone:** make the window narrow and the menu turns into a drawer.

## How the important parts work

**Billing.** Each subscription bills period number `next_period_index`, counted from its start date, so a subscription that starts on the 31st never drifts to the 28th for good. Billing starts when a subscription becomes active, skips periods while it is paused, and stops at its expiry date. A job runs when the server starts and every hour (daily on Vercel), and the **Generate due invoices** button runs the same job on demand. Repeating it is always safe.

**Discounts and tax.** Discounts are chosen automatically, stack in order, and come off before tax. A use is claimed with one atomic database update that checks the limit, so two invoices at once cannot both take the last use. Cancelling an invoice gives the use back.

**Payments.** Only confirmed invoices accept payments, and never more than what is owed. The invoice shows paid, outstanding and overdue.

**Security.** bcrypt password hashes, a signed httpOnly session cookie, hashed single-use reset tokens, rate limits on sign in, sign up and password reset, and server-side validation of everything the browser sends.

## Run it on your own machine

You need Node.js 22 (20.19 or newer works) and a running MySQL server.

```bash
npm run setup          # install everything
# copy server/.env.example to server/.env and set DB_USER and DB_PASSWORD
npm run db:setup       # create the tables and load the demo data
npm run dev            # API on port 4000, app on http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm test` | Runs the API tests against the database |
| `npm run build` | Builds the app for production |
| `npm run db:reset` | Wipes the database and loads the demo data again |
| `npm run db:seed:volume` | Adds thousands of subscriptions and invoices to check speed (`-- 20000` for 20,000) |

Without `SMTP_HOST` in `server/.env`, reset links and invoice emails are printed in the API console. Fill in the `SMTP_*` settings to send real email (a Gmail app password works).

## Put it online

Cadence runs on **Vercel** (the React app and the API as a serverless function) with a hosted MySQL database such as TiDB Cloud or Aiven.

1. Create a hosted MySQL database and copy its connection URL.
2. Put `DATABASE_URL`, `DB_SSL=true` and `BCRYPT_ROUNDS=12` in `server/.env.remote`, then run `npm run db:setup:remote` once.
3. In Vercel, set these Production variables: `DATABASE_URL`, `DB_SSL`, `JWT_SECRET`, `COOKIE_SECURE=true`, `CRON_SECRET` and `CLIENT_URL` (the site's address). Add `SMTP_*` and `MAIL_FROM` for real email.
4. Run `vercel --prod`, or push to the connected branch.

`vercel.json` sends every `/api/...` request to the Express app and schedules the billing job once a day. Open `/api/health` to check it. It answers `{"ok":true}`.

## Built with

**Node.js 22, Express 5, MySQL** (`mysql2` with plain SQL migrations, so the schema stays visible and nothing needs downloading), **zod** for validation, **React 19, React Router 7, Vite and Tailwind 4**. Fonts are bundled, so the app works offline. Hosted on Vercel with TiDB Cloud.

```
client/    React app: pages, components, layout and role-based navigation
server/
  src/
    routes/      API endpoints, one file per area
    services/    billing, subscriptions, dashboard, search
    utils/       money maths, invoice maths, mail
    validation/  input rules
  db/            SQL migrations, demo data, volume data
  test/          API tests
api/             Vercel entry point
docs/            the hackathon brief
```

## What's next

PDF invoices, a status history timeline, customers adding their own add-ons, and Razorpay Checkout (already built on the `feature/razorpay` branch, ready to switch on with test keys).

---

Built by [Denny Mathew](https://github.com/dennyhacks).
