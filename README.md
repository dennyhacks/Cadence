# Cadence

Subscription management and recurring billing for Brightloop Software: products, plans, subscriptions, invoices, payments and revenue reporting in one place.

**Stack:** Node.js + Express, MySQL (`mysql2`), React + Vite + Tailwind. Auth is our own: bcrypt-hashed passwords and signed httpOnly cookie sessions. No external services are needed, so it runs fully offline.

## Run it locally

You need Node.js 20.19+ (or 22+) and a running MySQL server.

```bash
# 1. Install everything
npm run setup

# 2. Add your MySQL details
#    Copy server/.env.example to server/.env, then set DB_USER and DB_PASSWORD.

# 3. Create the tables and demo data
npm run db:setup

# 4. Start the API (port 4000) and the app (port 5173)
npm run dev
```

Open http://localhost:5173.

`npm run db:reset` wipes the database and loads the demo data again. `npm test` runs the API tests (they need the database from step 3).

### Demo accounts

| Role     | Email                   | Password         |
| -------- | ----------------------- | ---------------- |
| Admin    | `admin@cadence.test`    | `Admin@12345`    |
| Staff    | `staff@cadence.test`    | `Staff@12345`    |
| Customer | `customer@cadence.test` | `Customer@12345` |

The sign-in page has buttons that fill these in while you run `npm run dev`.

### Password reset emails

If `SMTP_HOST` in `server/.env` is empty, the reset link is printed in the API console instead of being emailed. To send real email, fill in the `SMTP_*` settings (a Gmail app password works).

## Roles

- **Admin** controls the whole system and is the only role that can add staff.
- **Staff** handle day-to-day work with limited access.
- **Customer** signs up on their own and sees only their own subscriptions and invoices.

## Auth rules

- One account per email address (case-insensitive).
- Passwords need more than 8 characters, an uppercase letter, a lowercase letter and a special character.
- Reset links work once and expire after 60 minutes.

## Project layout

```
client/   React app (pages, components, auth context)
server/
  src/    Express app: routes, middleware, validation
  db/     SQL migrations, migrate and seed scripts
  test/   API tests
```

## Build progress

- [x] Phase 1: sign in, sign up, forgot and reset password, roles
- [ ] Phase 2: dashboard shell and navigation
- [ ] Phase 3: products, variants and plans
- [ ] Phase 4: taxes and discounts
- [ ] Phase 5: quotation templates and subscriptions
- [ ] Phase 6: invoices and payments
- [ ] Phase 7: finance reports
