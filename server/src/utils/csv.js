// Spreadsheet-safe CSV. Text that starts with = + - @ is prefixed with an apostrophe so a spreadsheet
// shows it as text instead of running it as a formula. Numbers are left alone.
const cell = (value) => {
  let s = value == null ? '' : String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** columns: [{ header, value: (row) => any }] */
export function toCsv(columns, rows) {
  const head = columns.map((c) => cell(c.header)).join(',');
  const body = rows.map((r) => columns.map((c) => cell(c.value(r))).join(','));
  return `${[head, ...body].join('\r\n')}\r\n`;
}
