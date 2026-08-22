// One stroke weight, one grid, one file. The reference designs use a single
// line-icon family throughout; scattering inline <svg> across views is how the
// current app ended up with four different visual accents for "warning".
const P = {
  home: "M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5",
  grid: "M3.5 3.5h7v7h-7zM13.5 3.5h7v7h-7zM3.5 13.5h7v7h-7zM13.5 13.5h7v7h-7z",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  book: "M4 4h6a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H4zM20 4h-6a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2.5H20z",
  chevron: "m6 9 6 6 6-6",
  close: "M6 6l12 12M18 6L6 18",
  burger: "M3 6h18M3 12h18M3 18h18",
  spark: "M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  doc: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5",
  warn: "M12 4 2.5 20h19zM12 10v4M12 17.5v.2",
  trend: "M3 17l6-6 4 4 8-8M15 7h6v6",
  shield: "M12 3l8 3v6c0 4.4-3.2 7.9-8 9-4.8-1.1-8-4.6-8-9V6z",
  coin: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5v9M14.5 10a2.5 2.5 0 0 0-5 0c0 2.8 5 1.2 5 4a2.5 2.5 0 0 1-5 0",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z",
  arrow: "M5 12h14M13 6l6 6-6 6",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  x: "M6 6l12 12M18 6L6 18",
  bookmark: "M6 3h12v18l-6-4.5L6 21z",
  check: "M4 12.5 9 17.5 20 6.5",
  lock: "M6 10h12v11H6zM8.5 10V7a3.5 3.5 0 1 1 7 0v3",
};

export default function Icon({ name, className }) {
  const d = P[name];
  if (!d) return null;
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
