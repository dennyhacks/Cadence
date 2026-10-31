// A twelve-month dial: one tick per month, and an arc that fills up to the current one.
// It is decorative, so screen readers skip it.

const CX = 160;
const CY = 160;
const RADIUS = 118;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const FILLED = 0.75; // nine of twelve months
const CURRENT_TICK = 9;

const ticks = Array.from({ length: 12 }, (_, i) => {
  const angle = ((i * 30 - 90) * Math.PI) / 180;
  const inner = i === CURRENT_TICK ? 128 : 138;
  const outer = 154;
  return {
    i,
    x1: CX + inner * Math.cos(angle),
    y1: CY + inner * Math.sin(angle),
    x2: CX + outer * Math.cos(angle),
    y2: CY + outer * Math.sin(angle),
  };
});

export default function CycleDial({ className = '' }) {
  return (
    <svg viewBox="0 0 320 320" className={className} aria-hidden="true" focusable="false">
      {ticks.map((t) => (
        <line
          key={t.i}
          x1={t.x1}
          y1={t.y1}
          x2={t.x2}
          y2={t.y2}
          strokeWidth={t.i === CURRENT_TICK ? 4 : 3}
          strokeLinecap="round"
          className={t.i === CURRENT_TICK ? 'stroke-signal' : t.i < CURRENT_TICK ? 'stroke-pine-300' : 'stroke-pine-700'}
        />
      ))}

      <circle cx={CX} cy={CY} r={RADIUS} fill="none" strokeWidth="10" className="stroke-pine-800" />
      <circle
        cx={CX}
        cy={CY}
        r={RADIUS}
        fill="none"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE * (1 - FILLED)}
        transform={`rotate(-90 ${CX} ${CY})`}
        className="dial-arc stroke-signal"
        style={{ '--dial-from': CIRCUMFERENCE, '--dial-to': CIRCUMFERENCE * (1 - FILLED) }}
      />
      <circle cx={CX - RADIUS} cy={CY} r="9" strokeWidth="4" className="dial-dot fill-signal stroke-pine-900" />

      <text x={CX} y={CY - 8} textAnchor="middle" className="fill-pine-200 font-sans text-[15px]">
        Renews
      </text>
      <text x={CX} y={CY + 26} textAnchor="middle" className="fill-white font-display text-[34px] font-semibold">
        monthly
      </text>
    </svg>
  );
}
