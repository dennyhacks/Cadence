const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
export const formatMoney = (n) => money.format(n);

/** "2026-01-31" -> "31 Jan 2026". Parsed as UTC so the day never shifts with the viewer's time zone. */
export const formatDay = (iso) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';

/** Parses a text input into a number, or NaN-safe undefined so the server can explain what is wrong. */
export const toNumber = (text) => (String(text).trim() === '' ? undefined : Number(text));
