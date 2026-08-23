// Intl objects are expensive to build, so they are created once at module scope rather than on
// every render. Hermes ships without full ICU in some builds — the same reason zones-rules.mjs
// carries a Mountain Time fallback — so construction is guarded and a plain formatter takes over.

const clockFormatter = createFormatter(
  () => new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" })
);

const percentFormatter = createFormatter(
  () => new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 })
);

function createFormatter<T>(build: () => T): T | null {
  try {
    return build();
  } catch {
    return null;
  }
}

export function formatClockTime(timestamp: number): string {
  if (clockFormatter) return clockFormatter.format(timestamp);
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/** `ratio` is 0..1. */
export function formatPercent(ratio: number): string {
  if (percentFormatter) return percentFormatter.format(ratio);
  return `${Math.round(ratio * 1000) / 10}%`;
}
