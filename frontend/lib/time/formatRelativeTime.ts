const UNITS: { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] = [
  { unit: "year", seconds: 60 * 60 * 24 * 365 },
  { unit: "month", seconds: 60 * 60 * 24 * 30 },
  { unit: "week", seconds: 60 * 60 * 24 * 7 },
  { unit: "day", seconds: 60 * 60 * 24 },
  { unit: "hour", seconds: 60 * 60 },
  { unit: "minute", seconds: 60 },
  { unit: "second", seconds: 1 },
];

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** Human-readable relative time (e.g. "5 minutes ago") from an ISO timestamp. */
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;

  const deltaSeconds = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(deltaSeconds);

  for (const { unit, seconds } of UNITS) {
    if (abs >= seconds || unit === "second") {
      const value = Math.round(deltaSeconds / seconds);
      return rtf.format(value, unit);
    }
  }

  return iso;
}
