import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Course } from './entities/course.entity';
import { Enrollment } from '../enrollments/entities/enrollment.entity';
import { QuizQuestion } from '../quiz/entities/quiz-question.entity';
import { QuizSubmission } from '../quiz/entities/quiz-submission.entity';
import { Profile } from '../profiles/entities/profile.entity';
import { LearningPath } from '../learning-paths/entities/learning-path.entity';
import { CourseAnalyticsDto } from './dto/course-analytics.dto';
import { LearnerAnalyticsRowDto } from './dto/learner-analytics-row.dto';
import { TrainerOverviewDto } from './dto/trainer-overview.dto';
import { POINTS_PER_MINUTE } from '../activity/activity.service';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// #227 — a learner who hasn't opened the course in this many days is
// flagged "inactive", regardless of pace. Picked as a reasonable default
// (the issue says "N days" without specifying N); not user-configurable
// today, but kept as a single named constant so that's a one-line change
// later if it needs to be.
const INACTIVITY_THRESHOLD_DAYS = 7;

// #227 — "behind pace" tolerance: a learner is only flagged once their
// actual progress trails their expected-by-now progress (see
// computeExpectedProgress) by more than this many percentage points.
// Without a tolerance, a learner who studies in occasional bursts rather
// than exactly on-schedule every single day would flip in and out of
// "behind" on razor-thin margins — a small buffer avoids that noise.
const PACE_TOLERANCE = 0.1; // 10 percentage points

@Injectable()
export class CourseAnalyticsService {
  constructor(
    @InjectRepository(Course)
    private readonly coursesRepo: Repository<Course>,
    @InjectRepository(Enrollment)
    private readonly enrollmentsRepo: Repository<Enrollment>,
    @InjectRepository(QuizQuestion)
    private readonly quizQuestionsRepo: Repository<QuizQuestion>,
    @InjectRepository(QuizSubmission)
    private readonly quizSubmissionsRepo: Repository<QuizSubmission>,
    @InjectRepository(Profile)
    private readonly profilesRepo: Repository<Profile>,
    @InjectRepository(LearningPath)
    private readonly learningPathsRepo: Repository<LearningPath>,
  ) {}

  async getAnalyticsForCourse(courseId: string): Promise<CourseAnalyticsDto> {
    const course = await this.coursesRepo.findOne({
      where: { id: courseId, deletedAt: IsNull() },
      relations: { modules: true },
    });
    if (!course) {
      throw new NotFoundException(`Course with id "${courseId}" not found`);
    }

    const enrollments = await this.enrollmentsRepo.find({
      where: { course: { id: courseId } },
      relations: { user: true },
      order: { createdAt: 'ASC' },
    });

    // #227 — QuizSubmission has no direct relation to Course (only to
    // QuizQuestion -> CourseModule -> Course, see that entity's comment),
    // so getting to "every submission for this course, across every
    // learner" takes the same two-hop lookup getQuizResultsForCourse
    // already does for a single user — just without the user filter, and
    // grouped by user afterward instead of assumed to be one user's rows.
    const moduleIds = course.modules.map((m) => m.id);
    const questions =
      moduleIds.length > 0
        ? await this.quizQuestionsRepo.find({
            where: { module: { id: In(moduleIds) } },
          })
        : [];
    const questionIds = questions.map((q) => q.id);
    const submissions =
      questionIds.length > 0
        ? await this.quizSubmissionsRepo.find({
            where: { question: { id: In(questionIds) } },
            relations: { user: true },
          })
        : [];

    const submissionsByUserId = new Map<string, QuizSubmission[]>();
    for (const s of submissions) {
      const userId = s.user.id;
      const existing = submissionsByUserId.get(userId);
      if (existing) {
        existing.push(s);
      } else {
        submissionsByUserId.set(userId, [s]);
      }
    }

    const now = Date.now();
    const learners: LearnerAnalyticsRowDto[] = enrollments.map((e) => {
      // #110 — Enrollment.progress is a Postgres decimal column with no
      // transformer defined, so the pg driver returns it as a string —
      // same quirk documented on the frontend's normalizeCourse/enrolled
      // state. Number(...) once here, same fix applied at every other
      // read site.
      const progress = Number(e.progress);
      const progressPct = Math.round(progress * 100);

      const userSubmissions = submissionsByUserId.get(e.user.id) ?? [];
      const quizAverageScorePct =
        userSubmissions.length > 0
          ? Math.round(
              (userSubmissions.filter((s) => s.isCorrect).length /
                userSubmissions.length) *
                100,
            )
          : null;

      const isComplete = e.status === 'complete';
      const referenceDate = e.lastAccessed ?? e.createdAt;
      const daysSinceActive =
        (now - new Date(referenceDate).getTime()) / MS_PER_DAY;
      const inactive =
        !isComplete && daysSinceActive >= INACTIVITY_THRESHOLD_DAYS;

      const behindPace =
        !isComplete &&
        this.isBehindPace(
          course.hours,
          e.user.dailyGoalPoints,
          e.createdAt,
          progress,
          now,
        );

      return {
        enrollmentId: e.id,
        userId: e.user.id,
        name: e.user.name || 'Encyclopedia Learner',
        progressPct,
        status: e.status,
        lastAccessed: e.lastAccessed,
        enrolledAt: e.createdAt,
        quizAverageScorePct,
        flags: { inactive, behindPace },
      };
    });

    const enrollmentCount = enrollments.length;
    const averageCompletionPct =
      enrollmentCount > 0
        ? Math.round(
            learners.reduce((sum, l) => sum + l.progressPct, 0) /
              enrollmentCount,
          )
        : 0;

    const learnersWithQuizScore = learners.filter(
      (l) => l.quizAverageScorePct !== null,
    );
    const averageQuizScorePct =
      learnersWithQuizScore.length > 0
        ? Math.round(
            learnersWithQuizScore.reduce(
              (sum, l) => sum + (l.quizAverageScorePct as number),
              0,
            ) / learnersWithQuizScore.length,
          )
        : null;

    return {
      enrollmentCount,
      averageCompletionPct,
      averageQuizScorePct,
      learners,
    };
  }

  // #259 — the "trainer home" rollup: how many courses/paths/students this
  // trainer touches, and how big their team is, at a glance. Deliberately
  // shallow compared to getAnalyticsForCourse above — no per-learner
  // detail, just counts — since that per-course depth is a click away via
  // the Analytics view this powers a summary above, not a replacement for.
  async getOverviewForOwner(userId: string): Promise<TrainerOverviewDto> {
    const profile = await this.profilesRepo.findOne({ where: { id: userId } });

    const [ownedCourses, ownedPaths] = await Promise.all([
      this.findOwnedOrShared(this.coursesRepo, userId, profile?.providerId ?? null),
      this.findOwnedOrShared(
        this.learningPathsRepo,
        userId,
        profile?.providerId ?? null,
      ),
    ]);

    const courseIds = ownedCourses.map((c) => c.id);
    // #417 — was `find({ relations: { user: true } })` over every matching
    // enrollment row, just to dedupe them into a count in JS. That joined
    // and hydrated a full Profile row per enrollment for data this only
    // ever turned into a number. A single COUNT(DISTINCT) aggregate does
    // the same dedupe on the DB side, with no join and no row hydration at
    // all — same "skip the query on an empty id list" guard as
    // getAnalyticsForCourse's questionIds check above, In([]) being a
    // needless round trip that always returns nothing.
    const totalStudents =
      courseIds.length > 0
        ? await this.enrollmentsRepo
            .createQueryBuilder('enrollment')
            .leftJoin('enrollment.course', 'course')
            .leftJoin('enrollment.user', 'user')
            .select('COUNT(DISTINCT user.id)', 'count')
            .where('course.id IN (:...courseIds)', { courseIds })
            .getRawOne<{ count: string }>()
            .then((row) => parseInt(row?.count ?? '0', 10))
        : 0;

    // A trainer with no provider is still a "team" of one (themselves);
    // one with a provider counts every member, owner included — matches
    // ProvidersService.getMine's member list, which always includes the
    // owner alongside everyone else who joined via invite code.
    const teamSize = profile?.providerId
      ? await this.profilesRepo.count({
          where: { providerId: profile.providerId },
        })
      : 1;

    return {
      totalCourses: ownedCourses.length,
      totalPaths: ownedPaths.length,
      totalStudents,
      teamSize,
    };
  }

  // #259 — mirrors TrainerScreen's client-side canEditCourse/canEditPath
  // exactly (own ownerId, or shared providerId), just run against the
  // whole not-deleted table server-side instead of a page's already-loaded
  // list. Two queries + a Map-dedupe rather than a single OR'd
  // QueryBuilder call — simpler to read, and cheap at this table size.
  private async findOwnedOrShared<T extends { id: string; deletedAt: Date | null }>(
    repo: Repository<T>,
    userId: string,
    providerId: string | null,
  ): Promise<T[]> {
    // #417 — owned/shared used to run sequentially (await, then await);
    // neither depends on the other's result, so running them together
    // shaves one full round-trip's latency off every call site (courses
    // and paths, both awaited again in parallel via Promise.all in
    // getOverviewForOwner below).
    const [owned, shared] = await Promise.all([
      repo.find({ where: { ownerId: userId, deletedAt: IsNull() } as any }),
      providerId
        ? repo.find({ where: { providerId, deletedAt: IsNull() } as any })
        : Promise.resolve([] as T[]),
    ]);
    const byId = new Map<string, T>();
    for (const item of [...owned, ...shared]) byId.set(item.id, item);
    return [...byId.values()];
  }

  // #227/#246 — "expected pace" derived from the same daily-goal concept
  // the Dashboard already surfaces (profiles.daily_goal_points): if a
  // learner studied their own daily goal every day since enrolling,
  // they'd need roughly (course.hours * 60 * POINTS_PER_MINUTE /
  // dailyGoalPoints) days to finish — course.hours is converted through
  // the same points scale as everything else so it's comparable to
  // dailyGoalPoints, which no longer means "minutes". Comparing elapsed
  // days against that expected duration gives an "expected progress by
  // now" fraction to compare their real progress against. Guards against
  // course.hours === 0 (a course with no estimated duration has no
  // meaningful pace to be behind on) rather than dividing by zero.
  private isBehindPace(
    courseHours: number,
    dailyGoalPoints: number,
    enrolledAt: Date,
    progress: number,
    now: number,
  ): boolean {
    if (courseHours <= 0 || dailyGoalPoints <= 0) return false;

    const totalPointsNeeded = courseHours * 60 * POINTS_PER_MINUTE;
    const expectedDaysToFinish = totalPointsNeeded / dailyGoalPoints;
    const daysSinceEnrolled =
      (now - new Date(enrolledAt).getTime()) / MS_PER_DAY;
    const expectedProgress = Math.min(
      1,
      daysSinceEnrolled / expectedDaysToFinish,
    );

    return progress < expectedProgress - PACE_TOLERANCE;
  }
}
