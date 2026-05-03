// Decide whether a clip is due for re-polling based on its age.
// Hour 0–6: poll every hour
// Hour 6–24: poll every 3 hours
// Day 2–7: poll every 6 hours
export function shouldPoll(opts: {
  submittedAt: Date;
  lastPolledAt: Date | null;
  now?: Date;
}): boolean {
  const now = opts.now ?? new Date();
  const ageHours = (now.getTime() - opts.submittedAt.getTime()) / 3_600_000;
  if (ageHours < 0) return false;

  const intervalHours = ageHours < 6 ? 1 : ageHours < 24 ? 3 : 6;

  if (!opts.lastPolledAt) return true;
  const sinceHours = (now.getTime() - opts.lastPolledAt.getTime()) / 3_600_000;
  // Allow a bit of slack so cron-tick jitter doesn't skip polls (subtract 5 min).
  return sinceHours >= intervalHours - 5 / 60;
}
