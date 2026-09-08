import { MigrationInterface, QueryRunner } from 'typeorm';

// #wire-course-rating-to-submissions — one-time backfill for existing
// data. EnrollmentsService.submitRating now recalculates Course.rating on
// every new/updated rating submission going forward, but that only fires
// on submission — any rating a learner already submitted before this
// deploy never triggered a recalculation, so those courses' `rating`
// would otherwise sit frozen at their old seed-time value indefinitely,
// only catching up once someone happens to re-rate. This backfills every
// course that already has at least one real submitted
// Enrollment.rating, using the same AVG-rounded-to-1-decimal logic as
// EnrollmentsService.recalculateCourseRating, so existing data matches
// the new behavior immediately rather than drifting back into sync over
// time. Courses with no real submissions yet are left untouched — same
// "don't wipe the seed baseline" rule the service method follows.
export class BackfillCourseRatingFromEnrollments1786170000000
  implements MigrationInterface
{
  name = 'BackfillCourseRatingFromEnrollments1786170000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "courses" AS c
      SET "rating" = sub."average"
      FROM (
        SELECT "course_id", ROUND(AVG("rating")::numeric, 1) AS "average"
        FROM "enrollments"
        WHERE "rating" IS NOT NULL
        GROUP BY "course_id"
      ) AS sub
      WHERE c."id" = sub."course_id";
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Not reversible — the pre-backfill seed values this overwrites were
    // never recorded anywhere, so there's nothing to restore them to.
    // Left as a deliberate no-op rather than guessing at old values.
  }
}
