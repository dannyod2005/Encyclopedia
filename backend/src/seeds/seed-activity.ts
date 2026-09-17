// src/seeds/seed-activity.ts
//
// #500 — the main "use every feature" orchestrator for the full reseed.
// Enrolls every #500 learner in a handful of courses in their own chosen
// track (Course.category), then simulates realistic progress against
// each enrollment: module completions gated by real quiz submissions
// (mirroring ModulesService/EnrollmentsService's actual gate + grading
// rules — see the basePointsPerModule/gradeMultiplier calc below), notes
// on some modules, ratings
// + reviews on completed courses, bookmarks on a few not-yet-enrolled
// courses, learning-path enrollments where a learner's own courses
// overlap a track-matching path, badges awarded per the real
// BADGE_DEFINITIONS trigger conditions, and leaderboard opt-in for most
// (not all) learners. Also recalculates each course's Course.rating from
// the seeded reviews, mirroring EnrollmentsService.recalculateCourseRating,
// so Catalogue/Discover ratings reflect the same reviews this script
// writes instead of only the static seed-time value.
//
// Deliberately writes straight to Postgres via AppDataSource (like every
// other seed script) rather than calling the real services — there's no
// authenticated request context to seed through, and going service-by-
// service for ~75 enrollments' worth of module/quiz/note/activity rows
// would mean hundreds of individual HTTP-shaped calls for no real
// benefit. The point-value and grading formulas below are copied
// verbatim from ActivityService/ModulesService/EnrollmentsService so the
// seeded numbers look exactly like ones the real app would have produced.
//
// Uses a seeded PRNG (mulberry32), not Math.random(), so re-running this
// against a fresh wipe produces the same distribution of course choices,
// grades, and activity every time — easier to reason about while
// iterating on the reseed than genuinely random data would be.
//
// Depends on #145 (seed:accounts), #500/seed:providers, #109
// (seed:courses), #500/seed:learning-paths, and #147/#500
// (seed:forum-posts) having already run — forum posts specifically,
// since this script's first_forum_post badge pass reads the forum_posts
// table those seed.
//
// Idempotent at the table level: skips entirely if enrollments already
// has any rows. Run the #144 wipe script first to reseed.
//
//   npm run seed:activity
//
// Requires DATABASE_URL in .env (same as every other seed/migration).

import 'dotenv/config';
import { AppDataSource } from '../data-source';
import { ACCOUNTS, Track } from './seed-accounts';

// ---- constants copied from the real point-earning logic (see
// ActivityService/ModulesService — kept in sync by convention, same as
// every other cross-file constant in this app) ----
const POINTS_PER_MINUTE = 10;
const MODULE_VIEW_POINTS = 3 * POINTS_PER_MINUTE;
const QUIZ_SUBMIT_POINTS = 5 * POINTS_PER_MINUTE;
const NOTE_SAVE_POINTS = 3 * POINTS_PER_MINUTE;

// ---- seeded PRNG (mulberry32) — deterministic across runs ----
function mulberry32(seed: number) {
  let a = seed;
  return function random(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(500109146); // #500/#109/#146 — arbitrary fixed seed

function randInt(min: number, max: number): number {
  // inclusive of both ends
  return Math.floor(rng() * (max - min + 1)) + min;
}
function chance(probability: number): boolean {
  return rng() < probability;
}
function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}
function shuffled<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

interface QuizOptionRow {
  id: string;
  isCorrect: boolean;
}
interface QuizQuestionRow {
  id: string;
  options: QuizOptionRow[];
}
interface ModuleRow {
  id: string;
  position: number;
  questions: QuizQuestionRow[];
}
interface CourseRow {
  id: string;
  title: string;
  category: Track;
  hours: number;
  modules: ModuleRow[];
}
interface ProfileRow {
  id: string;
  name: string;
  role: 'trainer' | 'learner';
  track: Track;
}
interface PathRow {
  id: string;
  title: string;
  courseIds: string[];
}

// A short pool of realistic review snippets, reused across courses —
// same "real copy, not bespoke per course" tradeoff as seed-courses.ts's
// CATEGORY_FAQS.
const REVIEW_SNIPPETS = [
  'Really well structured — the pacing made it easy to keep up alongside my day job.',
  'Exactly what I needed. The examples were practical, not just theory.',
  "Solid course. A couple of modules felt a bit rushed but overall worth it.",
  'Clear explanations throughout — I actually feel confident applying this now.',
  "Good foundation, though I wish there was a bit more depth in the later modules.",
  'One of the better courses I have taken here — practical and to the point.',
  'Helped me close a real skill gap on my team. Would recommend to a colleague.',
];

async function main() {
  await AppDataSource.initialize();

  const existingCount = await AppDataSource.query<{ count: string }[]>(
    'SELECT COUNT(*)::int AS count FROM "enrollments"',
  );
  if (Number(existingCount[0].count) > 0) {
    console.log(
      `Skipping seed: enrollments already has ${existingCount[0].count} row(s). ` +
        'This script only seeds an empty table — run the #144 wipe script first if you want to reseed.',
    );
    await AppDataSource.destroy();
    return;
  }

  // ---- load courses + modules + quiz content ----
  const courseRows = await AppDataSource.query<
    { id: string; title: string; category: Track; hours: number }[]
  >('SELECT id, title, category, hours FROM "courses"');

  const moduleRows = await AppDataSource.query<
    { id: string; course_id: string; position: number }[]
  >('SELECT id, course_id, position FROM "course_modules" ORDER BY course_id, position');

  const quizRows = await AppDataSource.query<
    {
      question_id: string;
      module_id: string;
      option_id: string;
      is_correct: boolean;
    }[]
  >(`
    SELECT qq.id AS question_id, qq.module_id, qo.id AS option_id, qo.is_correct
    FROM "quiz_questions" qq
    JOIN "quiz_options" qo ON qo.question_id = qq.id
    ORDER BY qq.module_id, qq.position, qo.position
  `);

  const questionsByModule = new Map<string, Map<string, QuizOptionRow[]>>();
  for (const row of quizRows) {
    if (!questionsByModule.has(row.module_id)) {
      questionsByModule.set(row.module_id, new Map());
    }
    const questions = questionsByModule.get(row.module_id)!;
    if (!questions.has(row.question_id)) {
      questions.set(row.question_id, []);
    }
    questions.get(row.question_id)!.push({ id: row.option_id, isCorrect: row.is_correct });
  }

  const modulesByCourse = new Map<string, ModuleRow[]>();
  for (const m of moduleRows) {
    const questions: QuizQuestionRow[] = [...(questionsByModule.get(m.id)?.entries() ?? [])].map(
      ([questionId, options]) => ({ id: questionId, options }),
    );
    const list = modulesByCourse.get(m.course_id) ?? [];
    list.push({ id: m.id, position: m.position, questions });
    modulesByCourse.set(m.course_id, list);
  }

  const courses: CourseRow[] = courseRows.map((c) => ({
    id: c.id,
    title: c.title,
    category: c.category,
    hours: Number(c.hours),
    modules: modulesByCourse.get(c.id) ?? [],
  }));
  const coursesByTrack = new Map<Track, CourseRow[]>();
  for (const c of courses) {
    const list = coursesByTrack.get(c.category) ?? [];
    list.push(c);
    coursesByTrack.set(c.category, list);
  }

  // ---- load profiles, zipped with ACCOUNTS for track/role ----
  const accountNames = ACCOUNTS.map((a) => a.name);
  const profileRows = await AppDataSource.query<
    { id: string; name: string; role: string }[]
  >('SELECT id, name, role FROM "profiles" WHERE name = ANY($1)', [accountNames]);
  const idByName = new Map(profileRows.map((p) => [p.name, p.id]));

  const missing = accountNames.filter((n) => !idByName.has(n));
  if (missing.length > 0) {
    throw new Error(
      `Missing seeded profile(s): ${missing.join(', ')}. Run "npm run seed:accounts" before seeding activity.`,
    );
  }

  const learners: ProfileRow[] = ACCOUNTS.filter((a) => a.role === 'learner').map(
    (a): ProfileRow => ({
      id: idByName.get(a.name)!,
      name: a.name,
      role: 'learner',
      track: a.track,
    }),
  );

  // ---- load learning paths (for the "some users signed up to a path" pass) ----
  const pathRows = await AppDataSource.query<
    { id: string; title: string; course_id: string }[]
  >(`
    SELECT lp.id, lp.title, lpc.course_id
    FROM "learning_paths" lp
    JOIN "learning_path_courses" lpc ON lpc.learning_path_id = lp.id
  `);
  const pathsById = new Map<string, PathRow>();
  for (const row of pathRows) {
    const existing = pathsById.get(row.id);
    if (existing) {
      existing.courseIds.push(row.course_id);
    } else {
      pathsById.set(row.id, { id: row.id, title: row.title, courseIds: [row.course_id] });
    }
  }
  const paths = [...pathsById.values()];

  // ---- per-learner course assignment: round-robin deal across each
  // track's full course list first (guarantees every course in every
  // track gets at least one learner — "up the activity on every page"),
  // then top up each learner to a 4-6 course "handful" ----
  const enrollmentsByLearner = new Map<string, CourseRow[]>();
  for (const learner of learners) enrollmentsByLearner.set(learner.id, []);

  for (const [track, trackCourses] of coursesByTrack) {
    const trackLearners = learners.filter((l) => l.track === track);
    if (trackLearners.length === 0) continue;

    const dealt = shuffled(trackCourses);
    dealt.forEach((course, i) => {
      const learner = trackLearners[i % trackLearners.length];
      enrollmentsByLearner.get(learner.id)!.push(course);
    });

    for (const learner of trackLearners) {
      const target = randInt(4, 6);
      const already = enrollmentsByLearner.get(learner.id)!;
      const alreadyIds = new Set(already.map((c) => c.id));
      const pool = shuffled(trackCourses.filter((c) => !alreadyIds.has(c.id)));
      let poolIndex = 0;
      while (already.length < target && poolIndex < pool.length) {
        already.push(pool[poolIndex]);
        poolIndex++;
      }
    }
  }

  let totalEnrollments = 0;
  let totalActivityEvents = 0;
  let totalQuizSubmissions = 0;
  let totalNotes = 0;
  let totalReviews = 0;
  let totalBookmarks = 0;
  let totalPathEnrollments = 0;

  for (const learner of learners) {
    const enrolledCourses = enrollmentsByLearner.get(learner.id)!;
    let completedCourseCount = 0;
    let earnedPerfectQuiz = false;

    for (const course of enrolledCourses) {
      const totalModules = course.modules.length;
      if (totalModules === 0) continue;

      // Weighted state roll: 40% complete, 40% in-progress, 20% just-started.
      const roll = rng();
      const state: 'complete' | 'in-progress' | 'just-started' =
        roll < 0.4 ? 'complete' : roll < 0.8 ? 'in-progress' : 'just-started';

      const completedModules =
        state === 'complete'
          ? totalModules
          : state === 'in-progress'
            ? Math.max(1, Math.min(totalModules - 1, randInt(1, totalModules - 1)))
            : chance(0.3)
              ? 1
              : 0;

      const courseStart = daysAgo(randInt(5, 45));
      let lastAccessed = courseStart;

      const basePointsPerModule = Math.round((course.hours * 60 * POINTS_PER_MINUTE) / totalModules);

      for (let i = 0; i < completedModules; i++) {
        const mod = course.modules[i];
        const moduleDate = new Date(
          courseStart.getTime() + i * randInt(1, 4) * 24 * 60 * 60 * 1000,
        );
        if (moduleDate.getTime() > Date.now()) moduleDate.setTime(Date.now());
        lastAccessed = moduleDate;

        // module_view activity event
        await AppDataSource.query(
          `INSERT INTO "activity_events" (user_id, source, points, module_id, occurred_at)
           VALUES ($1, 'module_view', $2, $3, $4)`,
          [learner.id, MODULE_VIEW_POINTS, mod.id, moduleDate],
        );
        totalActivityEvents++;

        // quiz submissions for every question in this module
        let correctCount = 0;
        for (const question of mod.questions) {
          const correctOption = question.options.find((o) => o.isCorrect);
          const answerCorrectly = chance(0.75);
          const chosenOption =
            answerCorrectly && correctOption
              ? correctOption
              : pick(question.options.filter((o) => !o.isCorrect)) ?? question.options[0];
          const isCorrect = chosenOption.isCorrect;
          if (isCorrect) correctCount++;

          await AppDataSource.query(
            `INSERT INTO "quiz_submissions" (user_id, question_id, option_id, answer_text, is_correct, submitted_at)
             VALUES ($1, $2, $3, NULL, $4, $5)`,
            [learner.id, question.id, chosenOption.id, isCorrect, moduleDate],
          );
          totalQuizSubmissions++;
        }

        if (mod.questions.length > 0) {
          await AppDataSource.query(
            `INSERT INTO "activity_events" (user_id, source, points, module_id, occurred_at)
             VALUES ($1, 'quiz_submit', $2, $3, $4)`,
            [learner.id, QUIZ_SUBMIT_POINTS, mod.id, moduleDate],
          );
          totalActivityEvents++;
        }

        const gradeMultiplier =
          mod.questions.length > 0 ? correctCount / mod.questions.length : 1;
        if (gradeMultiplier === 1 && mod.questions.length > 0) earnedPerfectQuiz = true;
        const modulePoints = Math.round(basePointsPerModule * gradeMultiplier);

        await AppDataSource.query(
          `INSERT INTO "activity_events" (user_id, source, points, module_id, occurred_at)
           VALUES ($1, 'module_complete', $2, $3, $4)`,
          [learner.id, modulePoints, mod.id, moduleDate],
        );
        totalActivityEvents++;

        // occasional note on this module
        if (chance(0.3)) {
          await AppDataSource.query(
            `INSERT INTO "module_notes" (module_id, user_id, content, updated_at)
             VALUES ($1, $2, $3, $4)`,
            [
              mod.id,
              learner.id,
              `Notes from module ${i + 1}: revisit this before the next quiz attempt.`,
              moduleDate,
            ],
          );
          await AppDataSource.query(
            `INSERT INTO "activity_events" (user_id, source, points, module_id, occurred_at)
             VALUES ($1, 'note_save', $2, $3, $4)`,
            [learner.id, NOTE_SAVE_POINTS, mod.id, moduleDate],
          );
          totalNotes++;
          totalActivityEvents++;
        }
      }

      // a peek at the next not-yet-completed module, for realism
      if (completedModules > 0 && completedModules < totalModules && chance(0.5)) {
        const nextMod = course.modules[completedModules];
        const peekDate = new Date(lastAccessed.getTime() + 24 * 60 * 60 * 1000);
        if (peekDate.getTime() <= Date.now()) {
          await AppDataSource.query(
            `INSERT INTO "activity_events" (user_id, source, points, module_id, occurred_at)
             VALUES ($1, 'module_view', $2, $3, $4)`,
            [learner.id, MODULE_VIEW_POINTS, nextMod.id, peekDate],
          );
          totalActivityEvents++;
          lastAccessed = peekDate;
        }
      }

      const progress = completedModules / totalModules;
      const status = completedModules >= totalModules ? 'complete' : 'in-progress';
      const hasReview = status === 'complete' && chance(0.7);
      const rating = status === 'complete' ? randInt(3, 5) : null;
      const reviewText = hasReview ? pick(REVIEW_SNIPPETS) : null;

      await AppDataSource.query(
        `INSERT INTO "enrollments" (user_id, course_id, progress, status, last_accessed, rating, review_text, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [learner.id, course.id, progress, status, lastAccessed, rating, reviewText, courseStart],
      );
      totalEnrollments++;
      if (rating !== null) totalReviews++;
      if (status === 'complete') completedCourseCount++;
    }

    // ---- badges ----
    if (completedCourseCount >= 1) {
      await AppDataSource.query(
        `INSERT INTO "user_badges" (user_id, badge_key) VALUES ($1, 'first_course_complete')
         ON CONFLICT DO NOTHING`,
        [learner.id],
      );
    }
    if (completedCourseCount >= 5) {
      await AppDataSource.query(
        `INSERT INTO "user_badges" (user_id, badge_key) VALUES ($1, 'five_courses_complete')
         ON CONFLICT DO NOTHING`,
        [learner.id],
      );
    }
    if (earnedPerfectQuiz) {
      await AppDataSource.query(
        `INSERT INTO "user_badges" (user_id, badge_key) VALUES ($1, 'perfect_quiz_score')
         ON CONFLICT DO NOTHING`,
        [learner.id],
      );
    }

    // ---- bookmarks on a couple of not-enrolled, same-track courses ----
    if (chance(0.6)) {
      const enrolledIds = new Set(enrolledCourses.map((c) => c.id));
      const trackPool = (coursesByTrack.get(learner.track) ?? []).filter(
        (c) => !enrolledIds.has(c.id),
      );
      const bookmarkCount = Math.min(randInt(1, 2), trackPool.length);
      for (const course of shuffled(trackPool).slice(0, bookmarkCount)) {
        await AppDataSource.query(
          `INSERT INTO "bookmarks" (user_id, course_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [learner.id, course.id],
        );
        totalBookmarks++;
      }
    }

    // ---- learning-path enrollment: pick the track-matching path with the
    // most overlap against this learner's own enrolled courses, if any ----
    const enrolledIds = new Set(enrolledCourses.map((c) => c.id));
    const candidatePaths = paths
      .map((p) => ({
        path: p,
        overlap: p.courseIds.filter((id) => enrolledIds.has(id)).length,
      }))
      .filter((p) => p.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap);
    if (candidatePaths.length > 0 && chance(0.6)) {
      await AppDataSource.query(
        `INSERT INTO "learning_path_enrollments" (user_id, learning_path_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [learner.id, candidatePaths[0].path.id],
      );
      totalPathEnrollments++;
    }

    // ---- leaderboard opt-in for most (not all) learners, deterministic pattern ----
    const learnerIndex = learners.indexOf(learner);
    const optIn = learnerIndex % 4 !== 3;
    await AppDataSource.query(
      `UPDATE "profiles" SET leaderboard_opt_in = $1 WHERE id = $2`,
      [optIn, learner.id],
    );
  }

  // ---- first_forum_post badge — anyone (learner or trainer) with at
  // least one seeded forum post, per BADGE_DEFINITIONS's real trigger
  // (createPost, not learner-restricted) ----
  const forumAuthors = await AppDataSource.query<{ user_id: string }[]>(
    'SELECT DISTINCT user_id FROM "forum_posts"',
  );
  for (const row of forumAuthors) {
    await AppDataSource.query(
      `INSERT INTO "user_badges" (user_id, badge_key) VALUES ($1, 'first_forum_post')
       ON CONFLICT DO NOTHING`,
      [row.user_id],
    );
  }

  // ---- recalculate Course.rating from the reviews just seeded, mirroring
  // EnrollmentsService.recalculateCourseRating exactly ----
  for (const course of courses) {
    const result = await AppDataSource.query<{ average: string | null }[]>(
      `SELECT AVG(rating) AS average FROM "enrollments" WHERE course_id = $1 AND rating IS NOT NULL`,
      [course.id],
    );
    const average = result[0]?.average;
    if (average === null || average === undefined) continue;
    await AppDataSource.query(`UPDATE "courses" SET rating = $1 WHERE id = $2`, [
      Math.round(Number(average) * 10) / 10,
      course.id,
    ]);
  }

  console.log(
    `Done. Seeded ${totalEnrollments} enrollment(s), ${totalActivityEvents} activity event(s), ` +
      `${totalQuizSubmissions} quiz submission(s), ${totalNotes} note(s), ${totalReviews} review(s), ` +
      `${totalBookmarks} bookmark(s), ${totalPathEnrollments} path enrollment(s) across ${learners.length} learner(s).`,
  );
  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
