import { useState } from 'react';
import { formatMoney } from '../format.js';

// Invoiced and collected per month. Two series, so a legend is always shown and a table view is one click away.
// Colours were checked against the dark surface for colour-blind separation and contrast: amber for invoiced, green for collected.
export const SERIES = [
  { key: 'invoiced', label: 'Invoiced', color: '#BC7F0C' },
  { key: 'collected', label: 'Collected', color: '#17A58B' },
];

const compact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 });
const monthLabel = (m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' });
const monthLong = (m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Rounds the top of the scale up to 1, 2, 2.5, 5 or 10 times a power of ten, with four steps. */
function niceMax(value) {
  if (value <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((f) => f * pow * 4 >= value) * pow;
  return step * 4;
}

const W = 760;
const H = 280;
const M = { top: 12, right: 12, bottom: 34, left: 58 };

export default function MonthlyChart({ months }) {
  const [active, setActive] = useState(null);
  const [asTable, setAsTable] = useState(false);

  const top = niceMax(Math.max(...months.flatMap((m) => [m.invoiced, m.collected])));
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const slot = plotW / months.length;
  const barW = Math.max(2, Math.min(18, slot / 2 - 3));
  const y = (v) => M.top + plotH - (v / top) * plotH;
  const everyNth = Math.ceil(months.length / 12);
  const ticks = [0, 1, 2, 3, 4].map((i) => (top / 4) * i);
  const hovered = active == null ? null : months[active];

  return (
    <figure>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Legend">
          {SERIES.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span className="size-3 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable} className="rounded-full border border-line px-3 py-1.5 text-sm font-medium hover:bg-white/10">
          {asTable ? 'Show chart' : 'Show as table'}
        </button>
      </div>

      {asTable ? (
        <div className="max-h-80 overflow-auto rounded-lg border border-line">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 border-b border-line bg-surface text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Month</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Invoiced</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Collected</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month} className="border-b border-line last:border-0">
                  <th scope="row" className="px-3 py-2 font-medium">{monthLong(m.month)}</th>
                  <td className="whitespace-nowrap px-3 py-2 text-right">{formatMoney(m.invoiced)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">{formatMoney(m.collected)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[620px]" role="img" aria-label={`Invoiced and collected per month, ${monthLabel(months[0].month)} to ${monthLabel(months.at(-1).month)}. Use Show as table for the numbers.`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="#2A2A2A" strokeWidth="1" opacity={t === 0 ? 1 : 0.6} />
                <text x={M.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#A3A3A0">{compact.format(t)}</text>
              </g>
            ))}
            {months.map((m, i) => {
              const cx = M.left + slot * i + slot / 2;
              return (
                <g key={m.month}>
                  {SERIES.map((s, j) => {
                    const h = Math.max(0, plotH - (y(m[s.key]) - M.top));
                    const x = cx + (j === 0 ? -barW - 1 : 1);
                    return h > 0 ? (
                      // Rounded only at the top, flat on the baseline, with a 2px gap between neighbours.
                      <path key={s.key} d={`M${x},${M.top + plotH} v${-(h - Math.min(4, h))} q0,${-Math.min(4, h)} ${Math.min(4, barW / 2)},${-Math.min(4, h)} h${barW - 2 * Math.min(4, barW / 2)} q${Math.min(4, barW / 2)},0 ${Math.min(4, barW / 2)},${Math.min(4, h)} v${h - Math.min(4, h)} z`} fill={s.color} opacity={active == null || active === i ? 1 : 0.45} />
                    ) : null;
                  })}
                  {i % everyNth === 0 && (
                    <text x={cx} y={H - 12} textAnchor="middle" fontSize="11" fill="#A3A3A0">{monthLabel(m.month)}</text>
                  )}
                  {/* A wide invisible target for each month, bigger than the bars, for mouse and keyboard. */}
                  <rect
                    x={M.left + slot * i}
                    y={M.top}
                    width={slot}
                    height={plotH}
                    fill="transparent"
                    tabIndex={0}
                    role="img"
                    aria-label={`${monthLong(m.month)}: invoiced ${formatMoney(m.invoiced)}, collected ${formatMoney(m.collected)}`}
                    onMouseEnter={() => setActive(i)}
                    onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                  />
                </g>
              );
            })}
          </svg>
          {hovered && (
            <div
              role="status"
              className="pointer-events-none absolute top-2 z-10 rounded-lg border border-line bg-surface px-3 py-2 text-sm"
              style={{ left: `${Math.min(70, Math.max(2, ((M.left + slot * active) / W) * 100))}%` }}
            >
              <p className="font-medium">{monthLong(hovered.month)}</p>
              {SERIES.map((s) => (
                <p key={s.key} className="flex items-center gap-2">
                  <span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
                  {s.label}: {formatMoney(hovered[s.key])}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
