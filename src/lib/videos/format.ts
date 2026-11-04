const matchDateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

/** "Oct 25, 2026" for a YYYY-MM-DD date, or "—" when unset. Safe on server and client. */
export function formatMatchDate(date: string | null): string {
  return date ? matchDateFormatter.format(new Date(`${date}T12:00:00`)) : "—";
}

/** "6.9 GB" style size for storage notes. */
export function formatGigabytes(bytes: number): string {
  return `${(bytes / 1e9).toFixed(1)} GB`;
}

/** "3:00" for a length in seconds. */
export function formatClock(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** "27 min" for a length in seconds. */
export function formatMinutes(seconds: number): string {
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}
