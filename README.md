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

Open http://localhost:5173. Visitors who are not signed in land on a front page that explains the product, with buttons to sign in or create an account.

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

Two more customers, `kite@cadence.test` and `orbit@cadence.test`, both use `Customer@12345`. Type them on the sign-in page.

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

Customers sign up on their own and can keep their company, phone and billing address under **My details**. These are copied onto each new invoice as "billed to". They can start a subscription from a quotation template, confirm it, and pause, resume, close or renew it when the plan allows.

## How it works

**Products and plans.** A product has a name, type, sales price, cost price, notes and variants. A variant adds an amount to the price (Brand: Odoo adds 560). A plan has a price, a billing period (daily, weekly, monthly or yearly), a minimum quantity and the dates it is available. Per plan, the admin decides whether subscriptions close on their own at the end date, can be closed early, paused or renewed. On a plan that closes on its own, a subscription takes the plan's end date as its expiry and cannot outlast it.

**Subscriptions.** Each has its own number, customer, plan, start and expiry dates, payment terms and lines (product, quantity, unit price, taxes, amount). Status moves Draft, Quotation, Confirmed, Active, Closed and is shown to the whole team. The server sets every price, so a client can never send its own. A subscription total is its lines plus the plan price once per period.

**Taxes and discounts.** The admin sets tax rules and they are calculated automatically, on the amount after discount. A tax marked "apply automatically" is added to every new line, so it cannot be forgotten, and can still be unticked on one line. Discounts (admin only) are a fixed amount or a percentage, with a minimum purchase or quantity, start and end dates and a usage limit. They apply to specific products or to whole subscriptions, show up on the next invoice by themselves, and stop when they expire or run out. Discounts apply to product lines, never the plan price.

**Invoices.** Invoices are created from active subscriptions with customer details, lines, taxes and totals filled in. The team can confirm, cancel, send and print them (Draft, Confirmed, Paid). Nothing is billed twice or skipped:

- A job runs when the server starts and then every hour, and the **Generate due invoices** button runs the same job on demand.
- It catches up any period that was missed, so a day the server was off is covered.
- The database allows one invoice per subscription and billing period, so even simultaneous runs cannot bill twice.
- Billing starts when a subscription becomes active, skips periods while it is paused, and stops at its expiry date.

**Paying online.** A customer opens a confirmed invoice (or presses **Pay now** in their list) and pays by card. This runs in **test mode**: only the published test cards work (4242 4242 4242 4242 approves, 4000 0000 0000 0002 is declined), no money moves, and the card number is never stored, only its last four digits in the payment note.

**Razorpay.** When `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are set (use the test-mode keys), the pay box opens Razorpay Checkout for card, UPI or net banking instead of the test-card form. The server creates the order for the amount still owed, then checks Razorpay's signature and reads the amount from Razorpay's own order before recording the payment, so a browser cannot claim a payment or change the amount. Each Razorpay payment id is recorded once. The secret key stays on the server.

**Reminders.** On an overdue invoice the team can press **Send reminder**, which emails the customer a link to view and pay it and records when the last reminder went out. The hourly job also sends one by itself, at most once a week per overdue invoice (addresses ending in `.test` are skipped, since they can never be delivered).

**Search.** The team gets a search box in the top bar. It finds subscriptions, invoices, products and plans, and a customer's name or email finds their subscriptions and invoices.

**Exports.** The invoice and payment lists each have an **Export CSV** button for the team. The invoice export follows the status filter, and text that could run as a spreadsheet formula is made safe.

**Payments.** Record a payment against a confirmed invoice with method, amount, date and a note. It can never exceed what is owed, and two payments recorded together cannot overpay. The invoice list shows paid, outstanding and overdue.

**Finance dashboard.** Active subscriptions, invoiced, collected, outstanding and overdue, a chart of invoiced versus collected by month (with a table view), subscriptions by status, a by-plan summary, the longest overdue invoices and the latest payments. Below those sit monthly recurring revenue (every plan's billing turned into a monthly figure), the yearly run rate, churn (subscriptions closed in the period) and a three-month forecast that assumes nothing changes from today. Filter by period and plan.

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

A dark interface with one lime accent: near-black surfaces, soft borders, pill-shaped buttons and tags, and big clean headings in Outfit, with Instrument Sans for tables and forms (both bundled, so the app works offline). The invoice page prints as dark text on white. Pages work from 390 px wide up, every input has a label, keyboard focus is visible, and motion respects the reduced-motion setting. The chart colours were checked for colour-blind separation and contrast on the dark surface.
