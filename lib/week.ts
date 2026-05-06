// Week helpers anchored to America/New_York. Weeks run Monday 00:00 ET → next Monday 00:00 ET.
// Uses the IANA zone (not a fixed UTC offset) so DST is handled correctly.

const ZONE = "America/New_York";

// Return the wall-clock parts (year/month/day/hour/minute/second/weekday) of `d` in ET.
function partsET(d: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  // 1 = Monday … 7 = Sunday (ISO)
  isoWeekday: number;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) map[p.type] = p.value;
  const wdMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: map.hour === "24" ? 0 : Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    isoWeekday: wdMap[map.weekday] ?? 1,
  };
}

// Return the UTC instant corresponding to a given ET wall-clock date+time.
// We invert the offset by computing what UTC instant produces those wall parts.
function etWallToUtc(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): Date {
  // Initial guess: treat the wall time as UTC, then correct by the actual ET offset for that instant.
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const p = partsET(new Date(guess));
  const guessAsET = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const offsetMs = guessAsET - guess;
  return new Date(guess - offsetMs);
}

// Start of the ET week (Monday 00:00 ET) containing the given instant.
export function weekStartET(d: Date = new Date()): Date {
  const p = partsET(d);
  // back up (isoWeekday - 1) days
  const utcMidnight = etWallToUtc(p.year, p.month, p.day, 0, 0, 0);
  return new Date(utcMidnight.getTime() - (p.isoWeekday - 1) * 86_400_000);
}

// End of the ET week (Monday 00:00 ET of the *following* week, exclusive).
export function weekEndET(d: Date = new Date()): Date {
  return new Date(weekStartET(d).getTime() + 7 * 86_400_000);
}

// Format a week as "Mon DD – Sun DD" (ET dates).
export function fmtWeekRange(weekStart: Date): string {
  const end = new Date(weekStart.getTime() + 6 * 86_400_000);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    month: "short",
    day: "numeric",
  });
  return `${fmt.format(weekStart)} – ${fmt.format(end)}`;
}
