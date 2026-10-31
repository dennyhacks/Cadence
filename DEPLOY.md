# Deploying Cadence to Vercel

Vercel serves the React app and runs the API as a serverless function. It does not host MySQL, so the database lives on a separate free service. Everything below is one-off setup.

## 1. A hosted MySQL database

Use any MySQL 8 service. Aiven (free MySQL plan) and TiDB Cloud (free serverless tier) both work. Create a database and copy its **connection URL**, which looks like:

```
mysql://USER:PASSWORD@HOST:PORT/DATABASE
```

Hosted databases need an encrypted connection, so the app is told `DB_SSL=true` below.

## 2. Load the tables and demo data (from your laptop, once)

Create `server/.env.remote` (it is ignored by git) with:

```
DATABASE_URL=mysql://USER:PASSWORD@HOST:PORT/DATABASE
DB_SSL=true
BCRYPT_ROUNDS=12
```

Then run:

```bash
npm run db:setup:remote
```

This creates the tables and loads the demo accounts and data into the hosted database. To wipe it and start again, run `ENV_FILE=.env.remote npm --prefix server run db:reset`.

## 3. Create the Vercel project

```bash
vercel login            # opens the browser, sign in once
vercel link             # create or pick the project, connect the GitHub repo if asked
```

Set these environment variables for **Production** (Vercel dashboard, Settings, Environment Variables, or `vercel env add NAME production`):

| Name | Value |
| --- | --- |
| `DATABASE_URL` | the connection URL from step 1 |
| `DB_SSL` | `true` |
| `JWT_SECRET` | a long random string (`openssl rand -hex 32`) |
| `COOKIE_SECURE` | `true` |
| `CRON_SECRET` | another long random string, used by the daily billing job |
| `CLIENT_URL` | the site's address, for example `https://cadence.vercel.app` |

Optional: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM` to send real email. Without them, reset links and invoice emails are printed in the function logs.

## 4. Deploy

```bash
vercel --prod
```

Or push to the branch connected in Vercel and it deploys on its own.

## 5. Check it

- Open the site and sign in with a demo account.
- Open `/api/health`. It should answer `{"ok":true}`.
- Open **Overview**. The numbers should match the demo data.

## How it runs on Vercel

- The React app is built by `npm run build` into `client/dist` and served as static files. Any page address that is not `/api/...` falls back to `index.html`, so links and refreshes work.
- Every `/api/...` request goes to `api/index.js`, which serves the same Express app used locally.
- The hourly billing job cannot run on a serverless host, so `vercel.json` schedules `GET /api/cron/billing` once a day. Vercel sends the `CRON_SECRET` with the request, and the endpoint refuses anything without it. You can also press **Generate due invoices** at any time. Running the job again never bills anything twice, because the database allows one invoice per subscription and period.
- A serverless function keeps its database pool small (3 connections) because several copies can run at once.

## If something fails

- **Blank page or 500 on `/api/...`:** open the deployment's Logs in Vercel. A missing or wrong `DATABASE_URL`, or `DB_SSL` not set, is the usual cause.
- **Cannot sign in on the site but the API is healthy:** check `COOKIE_SECURE=true` and that you are on the `https://` address.
- **"Set a strong JWT_SECRET" error:** `JWT_SECRET` is missing in Production.

## Updating the hosted database after a release

When a release adds a database migration, apply it to the hosted database before (or just after) deploying. This is safe to repeat, it only adds what is missing, and it keeps the existing data:

```bash
npm run db:setup:remote
```
