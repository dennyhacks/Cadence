# Cadence

Subscription management and recurring billing for Brightloop Software. Products, plans, quotations, subscriptions, invoices, payments and a finance dashboard, in one place.

**Stack:** Node.js + Express, MySQL (`mysql2`, plain SQL migrations), React + Vite + Tailwind. Sign-in is built in (bcrypt passwords, signed httpOnly cookie sessions), and every screen reads from the database. Nothing needs the internet, so it runs fully offline.

## Run it locally

You need Node.js 20.19+ (or 22+) and a running MySQL server.

```bash
# 1. Install everything
npm run setup

# 2. Add your MySQL details
#    Copy server/.env.example to server/.env, then set DB_USER and DB_PASSWORD.

# 3. Create the database, tables and demo data
npm run db:setup

# 4. Start the API (port 4000) and the app (port 5173)
npm run dev
```

Open http://localhost:5173.

| Command | What it does |
| --- | --- |
| `npm run db:reset` | Wipes the database and loads the demo data again |
| `npm test` | Runs the API tests against the database |
| `npm run build` | Builds the app for production (the API then serves it on its own port) |
| `npm run db:seed:volume` | Adds thousands of subscriptions and invoices to check speed (see below) |

### Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@cadence.test` | `Admin@12345` |
| Staff | `staff@cadence.test` | `Staff@12345` |
| Customer | `customer@cadence.test` | `Customer@12345` |

Two more customers, `kite@cadence.test` and `orbit@cadence.test`, both use `Customer@12345`. The sign-in page has buttons that fill in the first three.

The demo data is only for trying things out. It has products with variants, plans, taxes, discounts in every state, quotation templates, subscriptions in every status, and nine invoices that are paid, part paid, overdue or still draft.

## Put it online

`DEPLOY.md` explains how to host it on Vercel with a hosted MySQL database.

## What each role can do

| | Admin | Staff | Customer |
| --- | :-: | :-: | :-: |
| Finance dashboard | yes | yes | |
| Products, plans, quotation templates | yes | yes | |
| Taxes | yes | | |
| Discounts | yes | | |
| Add staff | yes | | |
| Subscriptions | all | all | their own |
| Invoices | all | all | their own, confirmed or paid |
| Record payments | yes | yes | |

Customers sign up on their own. They can start a subscription from a quotation template, confirm it, and pause, resume, close or renew it when the plan allows.

## How it works

**Products and plans.** A product has a name, type, sales price, cost price, notes and variants. A variant adds an amount to the price (Brand: Odoo adds 560). A plan has a price, a billing period (daily, weekly, monthly or yearly), a minimum quantity and the dates it is available. Per plan, the admin decides whether subscriptions close on their own at the end date, can be closed early, paused or renewed.

**Subscriptions.** Each has its own number, customer, plan, start and expiry dates, payment terms and lines (product, quantity, unit price, taxes, amount). Status moves Draft, Quotation, Confirmed, Active, Closed and is shown to the whole team. The server sets every price, so a client can never send its own. A subscription total is its lines plus the plan price once per period.

**Taxes and discounts.** The admin sets tax rules and they are calculated automatically, on the amount after discount. Discounts (admin only) are a fixed amount or a percentage, with a minimum purchase or quantity, start and end dates and a usage limit. They apply to specific products or to whole subscriptions, show up on the next invoice by themselves, and stop when they expire or run out. Discounts apply to product lines, never the plan price.

**Invoices.** Invoices are created from active subscriptions with customer details, lines, taxes and totals filled in. The team can confirm, cancel, send and print them (Draft, Confirmed, Paid). Nothing is billed twice or skipped:

- A job runs when the server starts and then every hour, and the **Generate due invoices** button runs the same job on demand.
- It catches up any period that was missed, so a day the server was off is covered.
- The database allows one invoice per subscription and billing period, so even simultaneous runs cannot bill twice.
- Billing starts when a subscription becomes active, skips periods while it is paused, and stops at its expiry date.

**Payments.** Record a payment against a confirmed invoice with method, amount, date and a note. It can never exceed what is owed, and two payments recorded together cannot overpay. The invoice list shows paid, outstanding and overdue.

**Finance dashboard.** Active subscriptions, invoiced, collected, outstanding and overdue, a chart of invoiced versus collected by month (with a table view), subscriptions by status, a by-plan summary, the longest overdue invoices and the latest payments. Filter by period and plan.

## Speed

Every page must answer in under two seconds with thousands of subscriptions. Totals are added up in SQL, lists are paginated, and the queries use indexes. To see it yourself:

```bash
npm run db:seed:volume          # about 5,000 subscriptions and 20,000 invoices
npm run db:seed:volume -- 20000 # or 20,000 subscriptions
npm test                        # the speed tests now run too
npm run db:reset                # back to the clean demo data
```

With 20,000 subscriptions and about 79,000 invoices, the slowest page we measured took about 110 ms.

## Rules the app enforces

- One account per email address (case-insensitive).
- Passwords need more than 8 characters, an uppercase letter, a lowercase letter and a special character, checked in the browser and again on the server.
- Reset links work once and expire after 60 minutes. Without `SMTP_HOST` in `server/.env`, links and invoice emails are printed in the API console instead of being sent. For real email, fill in the `SMTP_*` settings (a Gmail app password works).
- Every form shows a message per field, and the server checks everything again, whatever the browser sends.

## Project layout

```
client/   React app: pages, components, layout and navigation per role
server/
  src/
    routes/      API endpoints, one file per area
    services/    billing, subscriptions and dashboard logic
    utils/       money maths, invoice maths, mail
    validation/  input rules (zod)
  db/            SQL migrations, demo seed, volume seed
  test/          API tests
docs/            the hackathon brief
```

## Design notes

One colour scheme (pine and leaf green, with amber used sparingly), Bricolage Grotesque for headings and Instrument Sans for text, both bundled so the app works offline. Pages work from 390 px wide up, every input has a label, keyboard focus is visible, and motion respects the reduced-motion setting. The invoice page has a print layout.
