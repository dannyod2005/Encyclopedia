// src/scripts/cleanup-leaderboard-outlier.ts
//
// #322 — one-off cleanup for the Leaderboard screen showing an anomalous
// score (30,130 pts vs. ~750 for 2nd place). LeaderboardService ranks by
// *this week's* activity_events.points (see getWeeklyPointsForUsers), so
// this is very unlikely to be legitimate — 30k pts in a single week would
// mean ~20 module completions logged in the last few days, which isn't
// plausible test usage.
//
// Working theory: leftover duplicate activity_events rows from before the
// #312/#314 idempotency guards existed —
//   - module_complete used to have no dedup at all (fixed by #312: now at
//     most one ever, per user+module).
//   - note_save used to log on every autosave with no dedup (fixed by
//     #314: now at most one per user+module+day).
// Both are exactly the kind of "repeat the same action, get points again"
// gap those guards closed. This script finds rows that violate those same
// invariants (retroactively) for one flagged user and removes the extras,
// keeping the earliest row per (module, [day]) — same "first one counts"
// semantics #312/#314 enforce going forward.
//
// Scoped deliberately narrow: only the one account flagged in #322, only
// module_complete/note_save duplicates. Does NOT touch quiz_submit,
// forum_post, or module_view — those aren't the mechanism #312/#314 fixed
// and nothing so far suggests they're implicated here.
//
// Safety: dry-run by default, same pattern as wipe-test-data.ts and
// delete-course.ts. Prints every row it would delete, plus the resulting
// weekly-points total, and exits. Only deletes with --confirm.
//
//   npx ts-node -r tsconfig-paths/register src/scripts/cleanup-leaderboard-outlier.ts              # dry run
//   npx ts-node -r tsconfig-paths/register src/scripts/cleanup-leaderboard-outlier.ts --confirm     # actually deletes
//
// Optionally pass a profile id or name fragment as the first arg to target
// a different account than the one flagged in #322.

import 'dotenv/config';
import { AppDataSource } from '../data-source';

const DEFAULT_NAME_FRAGMENT = 'Uy'; // matches "Nguyễn Ngọc Thảo Uyên"

interface ActivityRow {
  id: string;
  source: string;
  module_id: string | null;
  points: number;
  occurred_at: Date;
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    s,
  );
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--confirm');
  const confirmed = process.argv.includes('--confirm');
  const target = args[0] ?? DEFAULT_NAME_FRAGMENT;

  await AppDataSource.initialize();

  const profiles = await AppDataSource.query<
    { id: string; name: string; leaderboard_opt_in: boolean }[]
  >(
    isUuid(target)
      ? `SELECT id, name, leaderboard_opt_in FROM profiles WHERE id = $1`
      : `SELECT id, name, leaderboard_opt_in FROM profiles WHERE name ILIKE '%' || $1 || '%'`,
    [target],
  );

  if (profiles.length === 0) {
    console.log(`No profile found matching "${target}".`);
    await AppDataSource.destroy();
    return;
  }
  if (profiles.length > 1) {
    console.log(
      `"${target}" matched more than one profile — pass a specific id instead:`,
    );
    for (const p of profiles) console.log(`  ${p.id}  ${p.name}`);
    await AppDataSource.destroy();
    return;
  }

  const profile = profiles[0];
  console.log(
    `Target: ${profile.name} (${profile.id}), leaderboard_opt_in=${profile.leaderboard_opt_in}\n`,
  );

  const weekStart = `date_trunc('week', now())`;

  const before = await AppDataSource.query<{ total: string }[]>(
    `SELECT COALESCE(SUM(points), 0)::text AS total FROM activity_events
     WHERE user_id = $1 AND occurred_at >= ${weekStart}`,
    [profile.id],
  );
  console.log(`Current weekly points (all sources): ${before[0].total}\n`);

  const bySource = await AppDataSource.query<
    { source: string; event_count: string; total_points: string }[]
  >(
    `SELECT source, COUNT(*)::text AS event_count, SUM(points)::text AS total_points
     FROM activity_events
     WHERE user_id = $1 AND occurred_at >= ${weekStart}
     GROUP BY source ORDER BY SUM(points) DESC`,
    [profile.id],
  );
  console.log('Breakdown by source (this week):');
  for (const row of bySource) {
    console.log(
      `  ${row.source.padEnd(16)} ${row.event_count.padStart(4)} events   ${row.total_points.padStart(8)} pts`,
    );
  }
  console.log();

  // All-time rows for the two farmable sources — not week-scoped, since a
  // duplicate logged before this week doesn't inflate this week's total
  // but would inflate a future week once it rolls around again... except
  // it can't, activity_events.occurred_at is fixed at insert time, so
  // only rows actually inside the current week window matter for the
  // leaderboard. Still pull all-time here for visibility into how far
  // back the farming went, in case that's useful context.
  const candidates = await AppDataSource.query<ActivityRow[]>(
    `SELECT id, source, module_id, points, occurred_at
     FROM activity_events
     WHERE user_id = $1 AND source IN ('module_complete', 'note_save')
     ORDER BY module_id, source, occurred_at ASC`,
    [profile.id],
  );

  const seen = new Set<string>();
  const toDelete: ActivityRow[] = [];
  for (const row of candidates) {
    const key =
      row.source === 'module_complete'
        ? `mc:${row.module_id}`
        : `ns:${row.module_id}:${row.occurred_at.toISOString().slice(0, 10)}`;
    if (seen.has(key)) {
      toDelete.push(row);
    } else {
      seen.add(key);
    }
  }

  if (toDelete.length === 0) {
    console.log(
      'No duplicate module_complete/note_save rows found for this user — the ' +
        'high total looks like genuine (if unusually heavy) activity, not a ' +
        'farming artifact. Leaving the data alone.',
    );
    await AppDataSource.destroy();
    return;
  }

  const pointsRemoved = toDelete.reduce((sum, r) => sum + r.points, 0);
  console.log(
    `Found ${toDelete.length} duplicate row(s) — ${pointsRemoved} pts total (all-time):\n`,
  );
  for (const row of toDelete) {
    console.log(
      `  ${row.id}  ${row.source.padEnd(16)} module=${row.module_id ?? '(none)'}  ${String(row.points).padStart(6)} pts  ${row.occurred_at.toISOString()}`,
    );
  }

  const weekStartDate = new Date();
  weekStartDate.setUTCHours(0, 0, 0, 0);
  weekStartDate.setUTCDate(
    weekStartDate.getUTCDate() - weekStartDate.getUTCDay(),
  );
  const thisWeekPointsRemoved = toDelete
    .filter((r) => r.occurred_at >= weekStartDate)
    .reduce((sum, r) => sum + r.points, 0);
  const newWeeklyTotal = Number(before[0].total) - thisWeekPointsRemoved;
  console.log(
    `\nOf that, ${thisWeekPointsRemoved} pts fall in the current week window — ` +
      `weekly total would drop from ${before[0].total} to ${newWeeklyTotal}.`,
  );

  if (!confirmed) {
    console.log(
      '\nDry run only — nothing was deleted. Re-run with --confirm to actually delete these rows.',
    );
    await AppDataSource.destroy();
    return;
  }

  const ids = toDelete.map((r) => r.id);
  await AppDataSource.query(`DELETE FROM activity_events WHERE id = ANY($1)`, [
    ids,
  ]);
  console.log(`\nDeleted ${ids.length} row(s).`);
  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
