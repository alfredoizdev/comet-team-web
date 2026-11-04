const matchDateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

/** "Oct 25, 2026" for a YYYY-MM-DD date, or "—" when unset. Safe on server and client. */
export function formatMatchDate(date: string | null): string {
  return date ? matchDateFormatter.format(new Date(`${date}T12:00:00`)) : "—";
}

/** "6.9 GB" style size for storage notes. */
export function formatGigabytes(bytes: number): string {
  return `${(bytes / 1e9).toFixed(1)} GB`;
}
