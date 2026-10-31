const PATHS = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  box: 'M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10',
  cycle: 'M20 12a8 8 0 1 1-2.4-5.7M20 4v4h-4',
  percent: 'M19 5L5 19M7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM16.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  tag: 'M3 12V4h8l10 10-8 8L3 12zM7.5 8.5h.01',
  doc: 'M6 3h9l4 4v14H6V3zM14 3v5h5M9 13h7M9 17h7',
  repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  receipt: 'M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3zM9 8h6M9 12h6',
  wallet: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zM3 7l12-3v3M17 14h.01',
  people: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20c0-3.3 3.1-6 7-6s7 2.7 7 6M17 4.3a3.5 3.5 0 0 1 0 6.4M22 20c0-2.6-1.8-4.8-4.5-5.7',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-7 8-7s8 3 8 7',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6L6 18',
  signout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h10',
};

export default function Icon({ name, className = 'size-5' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
