export default function Logo({ light = false, className = '' }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        {/* An open ring: a billing cycle that keeps going. */}
        <circle
          cx="14"
          cy="14"
          r="10"
          stroke="#D8FD34"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray="47 16"
          transform="rotate(-60 14 14)"
        />
        <circle cx="14" cy="14" r="2.6" fill="#F4F4F2" />
      </svg>
      <span className={`font-display text-xl font-semibold tracking-tight ${light ? 'text-white' : 'text-ink'}`}>
        Cadence
      </span>
    </div>
  );
}
