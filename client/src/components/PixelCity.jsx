import { useState } from 'react';

// An original pixel-art night street for the bottom of the front page. Everything is drawn from tiny rectangles, so it
// stays sharp at any size. The shops are real buttons: hover or focus one and it lights up and tells you what it does.

const W = 320;
const H = 120;
const GROUND = 96;

/** Joins neighbouring pixels of one colour into a single rectangle. */
function runs(rows) {
  const out = [];
  rows.forEach((row, y) => {
    let i = 0;
    while (i < row.length) {
      const c = row[i];
      if (c === '.' || c === ' ') {
        i += 1;
        continue;
      }
      let j = i;
      while (j < row.length && row[j] === c) j += 1;
      out.push({ x: i, y, w: j - i, c });
      i = j;
    }
  });
  return out;
}

function Sprite({ rows, colors, x = 0, y = 0, className, style }) {
  // The outer group places the sprite. The inner one carries any animation, which would otherwise replace the placement.
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={className} style={style}>
        {runs(rows).map((r, i) => (
          <rect key={i} x={r.x} y={r.y} width={r.w + 0.02} height="1.02" fill={colors[r.c]} />
        ))}
      </g>
    </g>
  );
}

// A tiny 3 by 5 pixel alphabet, just the letters the signs need.
const FONT = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'],
  N: ['##.', '#.#', '#.#', '#.#', '#.#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
};

function PixelText({ text, x, y, color, vertical = false }) {
  return (
    <g fill={color}>
      {[...text].map((ch, i) => (
        <Sprite
          key={i}
          rows={FONT[ch]}
          colors={{ '#': color }}
          x={vertical ? x : x + i * 4}
          y={vertical ? y + i * 6 : y}
        />
      ))}
    </g>
  );
}

const SHOPS = [
  {
    key: 'invoices', name: 'INVOICES', x: 14, w: 48, glow: '#ff4fd8', wall: '#2a1245',
    title: 'Invoices', text: 'Made every period by themselves, with taxes and discounts worked out. Never twice.',
  },
  {
    key: 'plans', name: 'PLANS', x: 68, w: 40, glow: '#4fb8ff', wall: '#14224a',
    title: 'Plans', text: 'Daily, weekly, monthly or yearly, with rules to close, pause or renew.',
  },
  {
    key: 'payments', name: 'PAYMENTS', x: 130, w: 48, glow: '#3ef0c0', wall: '#0f3138',
    title: 'Payments', text: 'Customers pay online, or the team records it. Paid, owed and overdue at a glance.',
  },
  {
    key: 'reports', name: 'REPORTS', x: 184, w: 44, glow: '#ffb829', wall: '#3a2410',
    title: 'Reports', text: 'Active subscriptions, revenue and overdue invoices, with filters.',
  },
];

function Shop({ shop, active }) {
  const { x, w, glow, wall, name } = shop;
  const top = 52;
  return (
    <g className="pc-shop" data-on={active ? '1' : '0'}>
      {/* The roof sign */}
      <rect x={x + 2} y={top - 12} width={w - 4} height="10" fill="#0b0618" />
      <rect x={x + 2} y={top - 12} width={w - 4} height="1" fill={glow} opacity="0.7" />
      <rect x={x + 2} y={top - 3} width={w - 4} height="1" fill={glow} opacity="0.7" />
      <g className="pc-neon">
        <PixelText text={name} x={x + Math.round((w - name.length * 4 + 1) / 2)} y={top - 9} color={glow} />
      </g>
      {/* The building */}
      <rect x={x} y={top} width={w} height={GROUND - top} fill={wall} />
      <rect x={x} y={top} width={w} height="1" fill={glow} opacity="0.5" />
      {/* Awning stripes */}
      {Array.from({ length: Math.floor(w / 4) }, (_, i) => (
        <rect key={i} x={x + i * 4} y={top + 1} width="4" height="5" fill={i % 2 ? glow : '#f4f4f2'} opacity={i % 2 ? 0.9 : 0.85} />
      ))}
      {/* A lit window and a door */}
      <rect className="pc-glow" x={x + 4} y={top + 10} width={Math.round(w * 0.5)} height="22" fill={glow} />
      <rect x={x + 4} y={top + 10} width={Math.round(w * 0.5)} height="22" fill="none" stroke="#0b0618" strokeWidth="1" />
      <rect x={x + 4 + Math.round(w * 0.25)} y={top + 10} width="1" height="22" fill="#0b0618" opacity="0.5" />
      <rect x={x + w - 15} y={top + 12} width="11" height={GROUND - top - 12} fill="#0b0618" />
      <rect className="pc-glow" x={x + w - 14} y={top + 13} width="9" height={GROUND - top - 13} fill={glow} opacity="0.35" />
      <rect x={x + w - 7} y={GROUND - 14} width="1" height="3" fill="#f4f4f2" />
    </g>
  );
}

const PALM = [
  '..gg.gggg.gg..',
  '.gggggggggggg.',
  'gg.gggggggg.gg',
  'g...gg..gg...g',
  '.....g..g.....',
];

function Palm({ x, scale = 1 }) {
  const trunk = Array.from({ length: 12 }, (_, i) => (
    <rect key={i} x={x + 6 + (i % 2 ? 0.5 : 0)} y={GROUND - 4 - i * 2.2} width="2" height="2.4" fill={i % 3 ? '#7a4a2a' : '#5b3720'} />
  ));
  return (
    <g style={{ transformOrigin: `${x + 7}px ${GROUND}px`, transform: `scale(${scale})` }}>
      {trunk}
      <Sprite rows={PALM} colors={{ g: '#25c25b' }} x={x} y={GROUND - 4 - 12 * 2.2 - 3} className="pc-sway" />
    </g>
  );
}

const PERSON = [
  '..hh..',
  '.hssh.',
  '.hssh.',
  '..ss..',
  '.jjjj.',
  'sjjjjs',
  's.jj.s',
  '..pp..',
  '..pp..',
  '.b..b.',
];

function Person({ x, y = GROUND + 4, colors, walk, label }) {
  return (
    <g className="pc-walker" style={walk} data-cursor="Hi!">
      <title>{label}</title>
      <g className="pc-hop">
        <Sprite rows={PERSON} colors={{ s: '#f5c9a1', b: '#14101f', ...colors }} x={x} y={y - 10} className="pc-bob" />
      </g>
    </g>
  );
}

const STARS = Array.from({ length: 34 }, (_, i) => ({
  x: (i * 53 + 11) % W,
  y: 4 + ((i * 37) % 40),
  d: (i % 7) * 0.45,
  big: i % 6 === 0,
}));

export default function PixelCity() {
  const [hovered, setHovered] = useState(null);
  const [focused, setFocused] = useState(null);
  const active = hovered ?? focused;
  const [parallax, setParallax] = useState(0);
  const current = SHOPS.find((s) => s.key === active) ?? (active === 'sign' ? { key: 'sign', x: 266, w: 20, title: 'Cadence', text: 'Subscription billing, from the first plan to the finance report.' } : null);

  const onMove = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    setParallax(((e.clientX - box.left) / box.width - 0.5) * 2);
    // Clear the label as soon as the pointer is not over a shop, even if the browser missed a leave event.
    if (!e.target.closest?.('button[data-look]')) setHovered(null);
  };

  return (
    <section aria-labelledby="street-heading" className="pc-sky relative overflow-hidden border-t border-line">
      <div className="mx-auto max-w-6xl px-5 pb-6 pt-16 text-center sm:px-8">
        <span className="inline-flex rounded-full border border-white/20 px-3.5 py-1 text-sm text-pine-200">Always on</span>
        <h2 id="street-heading" className="mx-auto mt-4 max-w-2xl font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          Billing keeps running after everyone goes home.
        </h2>
        <p className="mt-3 text-pine-200">Poke around. Hover a shop to see what it does.</p>
      </div>

      <div className="overflow-x-auto" onMouseMove={onMove} style={{ '--px': parallax }}>
        <div className="relative mx-auto min-w-[760px] max-w-[1500px]">
          <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" shapeRendering="crispEdges" role="img" aria-label="A pixel-art night street with shops named Invoices, Plans, Payments and Reports, palm trees and people walking.">
            {/* Stars and moon */}
            <g style={{ transform: 'translateX(calc(var(--px, 0) * -2px))' }}>
              {STARS.map((s, i) => (
                <rect key={i} className="pc-star" x={s.x} y={s.y} width={s.big ? 2 : 1} height={s.big ? 2 : 1} fill={s.big ? '#d8fd34' : '#ffffff'} style={{ animationDelay: `${s.d}s` }} />
              ))}
              <circle cx="40" cy="16" r="7" fill="#f4f1d0" />
              <circle cx="43" cy="14" r="6" fill="#1b0f36" />
            </g>

            {/* Far skyline */}
            <g style={{ transform: 'translateX(calc(var(--px, 0) * 4px))' }}>
              {[[0, 62, 26], [30, 54, 20], [58, 66, 30], [96, 48, 18], [122, 60, 24], [152, 52, 22], [182, 64, 28], [216, 50, 20], [244, 60, 26], [276, 54, 24], [304, 64, 22]].map(([x, y, w], i) => (
                <g key={i}>
                  <rect x={x} y={y} width={w} height={GROUND - y} fill="#150a2e" />
                  {Array.from({ length: Math.floor(w / 6) * 3 }, (_, k) => (
                    <rect key={k} x={x + 2 + (k % Math.floor(w / 6)) * 6} y={y + 4 + Math.floor(k / Math.floor(w / 6)) * 8} width="2" height="2" fill={(i + k) % 4 ? '#3a2a6a' : '#ffd77a'} opacity="0.8" />
                  ))}
                </g>
              ))}
            </g>

            {/* The street */}
            <rect x="0" y={GROUND} width={W} height={H - GROUND} fill="#241238" />
            <rect x="0" y={GROUND} width={W} height="2" fill="#6a3a8a" />
            <rect x="0" y={GROUND + 4} width={W} height="16" fill="#190d2c" />
            {Array.from({ length: 20 }, (_, i) => (
              <rect key={i} x={i * 16 + 4} y={GROUND + 11} width="8" height="1" fill="#d8fd34" opacity="0.5" />
            ))}

            {/* Palms, shops and the big sign */}
            <g style={{ transform: 'translateX(calc(var(--px, 0) * 8px))' }}>
              <Palm x={0} scale={1} />
              <Palm x={112} scale={0.9} />
              <Palm x={232} scale={1} />
              <Palm x={300} scale={0.85} />
              {SHOPS.map((s) => (
                <Shop key={s.key} shop={s} active={active === s.key} />
              ))}

              <g className="pc-shop" data-on={active === 'sign' ? '1' : '0'}>
                <rect x="276" y="40" width="2" height={GROUND - 40} fill="#2b1c44" />
                <rect x="266" y="26" width="20" height="46" fill="#0b0618" />
                <rect x="266" y="26" width="20" height="1" fill="#d8fd34" />
                <rect x="266" y="71" width="20" height="1" fill="#d8fd34" />
                <g className="pc-neon">
                  <PixelText text="CADENCE" x={274} y={29} color="#d8fd34" vertical />
                </g>
              </g>

              {/* A street lamp */}
              <rect x="244" y="62" width="1.5" height={GROUND - 62} fill="#3a2a5a" />
              <circle className="pc-lamp" cx="244.7" cy="61" r="3" fill="#ffd77a" />
            </g>

            {/* People */}
            <Person x={74} colors={{ h: '#3b1d0a', j: '#ff4fd8', p: '#2a3a8a' }} walk={{ animation: 'pc-walk-a 16s linear infinite' }} label="A customer on the way to pay an invoice" />
            <Person x={176} colors={{ h: '#d8fd34', j: '#4fb8ff', p: '#241238' }} walk={{ animation: 'pc-walk-b 22s linear infinite' }} label="A finance lead checking the numbers" />
            <Person x={236} colors={{ h: '#111111', j: '#ffb829', p: '#3a2a5a' }} walk={{ animation: 'pc-walk-c 12s linear infinite' }} label="Someone heading home" />
            <Person x={112} colors={{ h: '#7a4a2a', j: '#3ef0c0', p: '#1b1030' }} label="Someone waiting outside the Payments shop" />
          </svg>

          {/* Real buttons over the shops, for mouse, keyboard and touch */}
          {[...SHOPS, { key: 'sign', x: 262, w: 28, name: 'CADENCE', title: 'Cadence' }].map((s) => (
            <button
              key={s.key}
              type="button"
              aria-label={`${s.title}: ${SHOPS.find((x) => x.key === s.key)?.text ?? 'Subscription billing, from the first plan to the finance report.'}`}
              data-cursor="Look"
              data-look=""
              onMouseEnter={() => setHovered(s.key)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setFocused(s.key)}
              onBlur={() => setFocused(null)}
              onClick={() => setHovered((a) => (a === s.key ? null : s.key))}
              className="absolute rounded-md focus-visible:outline-2"
              style={{ left: `${(s.x / W) * 100}%`, width: `${(s.w / W) * 100}%`, top: `${((s.key === 'sign' ? 24 : 38) / H) * 100}%`, height: `${((GROUND - (s.key === 'sign' ? 24 : 38)) / H) * 100}%` }}
            />
          ))}

          {current && (
            <div
              role="status"
              className="pointer-events-none absolute z-10 w-60 -translate-x-1/2 rounded-2xl border border-white/15 bg-surface/95 p-3.5 text-left shadow-2xl backdrop-blur"
              style={{ left: `${((current.x + current.w / 2) / W) * 100}%`, top: `${(8 / H) * 100}%` }}
            >
              <p className="font-display text-base font-semibold text-leaf-600">{current.title}</p>
              <p className="mt-1 text-sm text-pine-200">{current.text}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
