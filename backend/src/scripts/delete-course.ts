// src/scripts/delete-course.ts
//
// One-off cleanup: soft-deletes a single course by id — same effect as
// clicking "Delete" in Trainer Studio (sets deleted_at, matching
// CoursesService.remove()), just bypassing RequireCourseOwnerGuard for
// cases where the logged-in trainer isn't the course's owner. Written for
// deleting the stray "Test" course (owned by Đỗ Thị Phương, no shared
// provider) that no trainer account you're logged in as can delete
// through the UI.
//
// Safety: dry-run by default, same pattern as wipe-test-data.ts. Prints
// the matching course and exits. Only writes anything when run with
// --confirm.
//
//   npm run typeorm -- ... (not used — this runs directly via ts-node)
//   npx ts-node -r tsconfig-paths/register src/scripts/delete-course.ts <courseId>              # dry run
//   npx ts-node -r tsconfig-paths/register src/scripts/delete-course.ts <courseId> --confirm     # actually deletes
//
// Defaults to the "Test" course's id if none is passed.

import 'dotenv/config';
import { AppDataSource } from '../data-source';

const DEFAULT_COURSE_ID = '095f72e0-2dae-4335-b5b8-c10d889e9960'; // "Test", owned by Đỗ Thị Phương

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--confirm');
  const confirmed = process.argv.includes('--confirm');
  const courseId = args[0] ?? DEFAULT_COURSE_ID;

  await AppDataSource.initialize();

  const rows = await AppDataSource.query<
    {
      id: string;
      title: string;
      owner_id: string | null;
      deleted_at: Date | null;
    }[]
  >(`SELECT id, title, owner_id, deleted_at FROM courses WHERE id = $1`, [
    courseId,
  ]);

  if (rows.length === 0) {
    console.log(`No course found with id ${courseId}.`);
    await AppDataSource.destroy();
    return;
  }

  const course = rows[0];
  console.log('Found course:');
  console.log(`  id:         ${course.id}`);
  console.log(`  title:      ${course.title}`);
  console.log(`  owner_id:   ${course.owner_id ?? '(none)'}`);
  console.log(`  deleted_at: ${course.deleted_at ?? '(not deleted)'}`);

  if (course.deleted_at) {
    console.log('\nAlready soft-deleted — nothing to do.');
    await AppDataSource.destroy();
    return;
  }

  if (!confirmed) {
    console.log(
      '\nDry run only — nothing was deleted. Re-run with --confirm to actually delete.',
    );
    await AppDataSource.destroy();
    return;
  }

  await AppDataSource.query(
    `UPDATE courses SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`,
    [courseId],
  );
  console.log(
    '\nDeleted (soft-delete — deleted_at set). It will no longer show in the app.',
  );
  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
