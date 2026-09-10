import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, QueryFailedError, Repository } from 'typeorm';
import { PDFDocument, rgb } from 'pdf-lib';
import * as fontkit from '@pdf-lib/fontkit';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { Enrollment } from './entities/enrollment.entity';
import { Profile } from '../profiles/entities/profile.entity';
import { Course } from '../courses/entities/course.entity';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import {
  EnrolledCourseDto,
  EnrollmentResponseDto,
} from './dto/enrollment-response.dto';
import { UpdateProgressDto } from './dto/update-progress.dto';
import { SubmitRatingDto } from './dto/submit-rating.dto';
import { CourseReviewDto } from './dto/course-review.dto';
import {
  ActivityService,
  POINTS_PER_MINUTE,
} from '../activity/activity.service';
import { ModulesService } from '../modules/modules.service';
import { BadgesService } from '../badges/badges.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ModuleQuizResultDto } from '../quiz/dto/module-quiz-result.dto';

// #260 — the shape computeCourseGrade below returns, extracted so the
// grade/pass-tier calculation can be unit-tested directly without going
// through generateCertificate's PDF rendering (real font files, pdf-lib
// document creation, etc.) — see enrollments.service.spec.ts.
export interface CourseGrade {
  courseGradePct: number | null;
  passed: boolean;
}

// #241/#254 — a course grade at/above this earns the "Passed"
// certificate tier instead of the standard "Completed" one.
//
// This is intentionally the SAME NAME AND VALUE as frontend's
// PASS_THRESHOLD_PCT in LearningScreen.jsx (used there for the below-bar
// nudge/grade-color display). There's no shared module between this
// NestJS backend and the CRA frontend (CRA blocks importing from outside
// frontend/src, and there's no workspace tooling set up), so the two
// constants are kept in sync by convention: same name, same value,
// cross-referencing comments, and a test on each side asserting the
// value is 70 (see enrollments.service.spec.ts). If you change one,
// change the other.
export const PASS_THRESHOLD_PCT = 70;

// #260 — extracted from generateCertificate as a pure, standalone function
// so it has direct unit-test coverage (see enrollments.service.spec.ts)
// instead of only being reachable through the whole PDF-generation flow.
// No behavior change: generateCertificate below calls this exact logic,
// byte-for-byte what it inlined before this issue.
//
// #241 — same pooled, question-weighted course grade as #240's frontend
// course grade and CourseAnalyticsService's per-learner quiz average: sum
// correct answers over sum question counts across every taken-and-quizzed
// module. null (not 0%) when this course has no taken-and-quizzed modules
// — including a course with no quiz content anywhere — so it can never
// accidentally clear the pass bar below.
export function computeCourseGrade(
  moduleResults: ModuleQuizResultDto[],
): CourseGrade {
  const gradedModules = moduleResults.filter((m) => m.hasQuiz && m.taken);
  const courseGradePct =
    gradedModules.length > 0
      ? Math.round(
          (gradedModules.reduce((sum, m) => sum + (m.score ?? 0), 0) /
            gradedModules.reduce((sum, m) => sum + m.total, 0)) *
            100,
        )
      : null;
  const passed =
    courseGradePct !== null && courseGradePct >= PASS_THRESHOLD_PCT;

  return { courseGradePct, passed };
}

@Injectable()
export class EnrollmentsService {
  constructor(
    @InjectRepository(Enrollment)
    private readonly enrollmentsRepo: Repository<Enrollment>,
    @InjectRepository(Profile)
    private readonly profilesRepo: Repository<Profile>,
    @InjectRepository(Course)
    private readonly coursesRepo: Repository<Course>,
    private readonly activityService: ActivityService,
    private readonly modulesService: ModulesService,
    private readonly badgesService: BadgesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(userId: string, dto: CreateEnrollmentDto): Promise<Enrollment> {
    const profile = await this.profilesRepo.findOne({ where: { id: userId } });
    if (!profile) {
      throw new NotFoundException('Profile not found for this user');
    }

    // deletedAt filter: a soft-deleted course shouldn't be enrollable —
    // same NotFoundException as a genuinely missing course, since from the
    // learner's perspective it no longer exists.
    // #426 — modules relation now loaded (wasn't before) so the
    // resume-progress seeding below has a module list to check completion
    // history against; harmless for the ordinary first-time-enrol path,
    // which just doesn't find any completed modules in it.
    const course = await this.coursesRepo.findOne({
      where: { id: dto.courseId, deletedAt: IsNull() },
      relations: { modules: true },
    });
    if (!course) {
      throw new NotFoundException(`Course with id "${dto.courseId}" not found`);
    }

    const enrollment = this.enrollmentsRepo.create({
      user: profile,
      course,
    });

    // #426 — a re-enrollment after a previous unenroll shouldn't start
    // this course over from module 1: quiz answers/notes/module_complete
    // history all survive unenrolling already (see remove()'s comment),
    // so a fresh Enrollment row landing back at progress: 0 contradicted
    // what the Grades panel still showed. Seed progress/status from this
    // user's real completed-module history for this course instead of
    // leaving the entity defaults in place. A genuinely first-time
    // enrollment has no completed modules for this course yet, so
    // completedModules is 0 and this is a no-op — same as before.
    //
    // Deliberately does NOT go through updateProgress or call any
    // badge/notification logic here: those already fired the first time
    // this learner completed (parts of) this course, and re-firing them
    // on a resumed enrollment would be wrong. This only sets the two raw
    // columns updateProgress would otherwise compute.
    const totalModules = course.modules.length;
    if (totalModules > 0) {
      const moduleIds = course.modules.map((m) => m.id);
      const completedIds = await this.activityService.getCompletedModuleIds(
        userId,
        moduleIds,
      );
      const completedModules = course.modules.filter((m) =>
        completedIds.has(m.id),
      ).length;
      if (completedModules > 0) {
        enrollment.progress = completedModules / totalModules;
        enrollment.status =
          completedModules >= totalModules ? 'complete' : 'in-progress';
      }
    }

    try {
      return await this.enrollmentsRepo.save(enrollment);
    } catch (err) {
      if (err instanceof QueryFailedError && (err as any).code === '23505') {
        throw new ConflictException('Already enrolled in this course');
      }
      throw err;
    }
  }

  // #255 — lets a learner leave a course. A hard delete rather than a
  // status flag: Enrollment carries no soft-delete column (unlike Course,
  // #41), and nothing else in the schema references enrollment.id by FK
  // (quiz submissions/notes/forum posts are all keyed on (user, module/
  // question) directly, not on the enrollment row — see the entity
  // comments), so removing this row cleanly drops the enrollment without
  // touching anything downstream. A learner's quiz answers and notes for
  // this course are left in place and simply resurface if they re-enrol
  // later — deliberately not wiped here, since there's no "wipe a user's
  // course history" concept anywhere else in this app either. If this
  // course was part of a learning path the learner is enrolled in, that
  // path's derived progress (LearningPathEnrollmentsService) naturally
  // reflects the drop on its next read — nothing to update here.
  async remove(userId: string, enrollmentId: string): Promise<void> {
    const enrollment = await this.enrollmentsRepo.findOne({
      where: { id: enrollmentId },
      relations: { user: true },
    });

    if (!enrollment) {
      throw new NotFoundException(
        `Enrollment with id "${enrollmentId}" not found`,
      );
    }

    // Ownership check: same principle as updateProgress/submitRating above
    // — never trust the client to only ever send its own enrollment id.
    if (enrollment.user.id !== userId) {
      throw new ForbiddenException('This enrollment does not belong to you');
    }

    await this.enrollmentsRepo.remove(enrollment);
  }

  // #300 — "Retake" on a completed course, from the Dashboard's Completed
  // section: unenrol + immediately re-enrol in one atomic step, rather
  // than exposing this as two separate frontend calls with a failure
  // window between them. Can't do create-then-remove instead to close
  // that window a different way — Enrollment's (user, course) unique
  // constraint means a fresh row can only be inserted once the old one is
  // actually gone. Wrapped in a transaction so a mid-request failure
  // can't leave the learner with neither an old nor a new enrollment.
  //
  // Deliberately reuses remove()'s exact ownership check and create()'s
  // exact deleted-course guard rather than skipping either just because
  // this is a compound operation — see those two methods' comments for
  // why each exists. What this does NOT do: touch the learner's quiz
  // submissions or notes for this course (same as remove() always
  // hasn't — see that method's comment) — a retake resets progress/
  // status, not quiz history. The frontend confirm copy is explicit
  // about that.
  async retake(userId: string, enrollmentId: string): Promise<Enrollment> {
    const enrollment = await this.enrollmentsRepo.findOne({
      where: { id: enrollmentId },
      relations: { user: true, course: true },
    });

    if (!enrollment) {
      throw new NotFoundException(
        `Enrollment with id "${enrollmentId}" not found`,
      );
    }

    if (enrollment.user.id !== userId) {
      throw new ForbiddenException('This enrollment does not belong to you');
    }

    // Same guard as create(): a course pulled from the catalogue since
    // this enrollment was made shouldn't be retake-able, even though the
    // about-to-be-removed enrollment still references it.
    if (enrollment.course.deletedAt) {
      throw new NotFoundException(
        `Course with id "${enrollment.course.id}" not found`,
      );
    }

    const { user, course } = enrollment;

    return this.enrollmentsRepo.manager.transaction(async (manager) => {
      await manager.remove(enrollment);
      return manager.save(manager.create(Enrollment, { user, course }));
    });
  }

  async findAllForUser(userId: string): Promise<EnrollmentResponseDto[]> {
    const enrollments = await this.enrollmentsRepo.find({
      where: { user: { id: userId } },
      // course.modules loaded (and embedded below) so the dashboard/
      // learning screen work off this snapshot rather than re-looking the
      // course up in the catalogue list, which omits soft-deleted courses
      // (#41) — see EnrolledCourseDto.
      relations: { course: { modules: true } },
      order: { createdAt: 'DESC', course: { modules: { position: 'ASC' } } },
    });

    return enrollments.map((e) => this.toResponseDto(e));
  }

  async updateProgress(
    userId: string,
    enrollmentId: string,
    dto: UpdateProgressDto,
  ): Promise<EnrollmentResponseDto> {
    const enrollment = await this.enrollmentsRepo.findOne({
      where: { id: enrollmentId },
      relations: { user: true, course: { modules: true } },
      order: { course: { modules: { position: 'ASC' } } },
    });

    if (!enrollment) {
      throw new NotFoundException(
        `Enrollment with id "${enrollmentId}" not found`,
      );
    }

    // Ownership check: a user can only update their own enrollment. Never
    // trust that the client only ever sends its own enrollment id —
    // verify against the token-derived userId, same principle as create().
    if (enrollment.user.id !== userId) {
      throw new ForbiddenException('This enrollment does not belong to you');
    }

    const totalModules = enrollment.course.modules.length;
    // Clamp: a client sending a stale/bad value shouldn't be able to push
    // completedModules past the real module count.
    const completedModules = Math.min(dto.completedModules, totalModules);

    // Captured before we overwrite progress below — needed to work out how
    // many *new* modules this call actually completed, for activity
    // logging (#37). Rounding a fraction back to a module count is a bit
    // lossy, but progress is always derived from a module count in the
    // first place, so it round-trips cleanly in practice.
    const oldCompletedModules =
      totalModules > 0 ? Math.round(enrollment.progress * totalModules) : 0;

    // #205/#246 — server-side mirror of LearningScreen's Mark Complete
    // gate: a module with a quiz can't be counted as complete until that
    // quiz has actually been submitted, so a client can't bypass the
    // frontend gate by just calling this endpoint directly with a bumped
    // completedModules. Only checked when progress is actually advancing
    // (a same-or-lower value has nothing newly "completed" to validate).
    // getQuizResultsForCourse is the same lookup CoursesModule's
    // GET /courses/:id/quiz-results already uses, so "taken" here means
    // exactly what the frontend's quizResultsOverview shows. Hoisted out
    // of this block (rather than being local to it) so the points-logging
    // block further down can reuse the exact same quiz snapshot for its
    // grade multiplier — one query, not two, and both reads see the same
    // moment-in-time quiz state.
    let quizStatusByModuleId: Map<string, ModuleQuizResultDto> | null = null;
    if (completedModules > oldCompletedModules) {
      const newlyCompletedModules = enrollment.course.modules.slice(
        oldCompletedModules,
        completedModules,
      );
      const quizResults = await this.modulesService.getQuizResultsForCourse(
        userId,
        enrollment.course.id,
      );
      quizStatusByModuleId = new Map(quizResults.map((r) => [r.moduleId, r]));
      const blockedModule = newlyCompletedModules.find((m) => {
        const status = quizStatusByModuleId!.get(m.id);
        return status?.hasQuiz && !status.taken;
      });
      if (blockedModule) {
        throw new BadRequestException(
          `Complete the quiz for "${blockedModule.title}" before marking it as done`,
        );
      }
    }

    // #225 — captured before the assignment below so the badge check
    // after save() can tell "just became complete" apart from "was
    // already complete" (e.g. a no-op re-save from a stale/duplicate
    // client call shouldn't re-evaluate the completion badges).
    const wasComplete = enrollment.status === 'complete';

    enrollment.progress =
      totalModules > 0 ? completedModules / totalModules : 0;
    enrollment.status =
      completedModules >= totalModules && totalModules > 0
        ? 'complete'
        : 'in-progress';
    enrollment.lastAccessed = new Date();

    const saved = await this.enrollmentsRepo.save(enrollment);

    // #225 — course-completion badges, only on a genuine in-progress ->
    // complete transition. completedCourseCount is this learner's total
    // completed enrollments *including* the one just saved, since
    // BadgesService.evaluateCourseCompletion checks against the exact
    // count at which each badge is first earned (see that method).
    if (!wasComplete && saved.status === 'complete') {
      const completedCourseCount = await this.enrollmentsRepo.count({
        where: { user: { id: userId }, status: 'complete' },
      });
      await this.badgesService.evaluateCourseCompletion(
        userId,
        completedCourseCount,
      );

      // #257 — same in-progress -> complete transition guard as the badge
      // check just above, so this fires exactly once per course, not on
      // every subsequent no-op re-save of an already-complete enrollment.
      // saved.user/saved.course are the same already-loaded relations the
      // rest of this method uses (see the findOne above and the comment
      // on the toResponseDto call at the end of this method) — no extra
      // query needed to notify.
      await this.notificationsService.createForCourseCompletion(
        saved.user,
        saved.course,
      );
    }

    const newlyCompleted = Math.max(completedModules - oldCompletedModules, 0);
    if (newlyCompleted > 0 && totalModules > 0) {
      // Estimate: this course's total hours spread evenly across its
      // modules, converted to points via the same POINTS_PER_MINUTE scale
      // as every other flat estimate in this app. Not a measured duration
      // — see #37.
      const basePointsPerModule = Math.round(
        (enrollment.course.hours * 60 * POINTS_PER_MINUTE) / totalModules,
      );

      // #124 — log per specific module rather than one lump sum for
      // "however many modules got completed this call", so each module's
      // estimated points can be split across the distinct days *that*
      // module was actually viewed (see ActivityService.logModuleCompletion)
      // instead of all landing on whichever day this request happened to
      // fire. enrollment.course.modules is already ordered by position
      // (see the query above), and modules are always completed in that
      // same order, so this slice is exactly the newly-completed ones.
      const newlyCompletedModules = enrollment.course.modules.slice(
        oldCompletedModules,
        completedModules,
      );
      for (const module of newlyCompletedModules) {
        // #246 — a module's completion points are its base estimate times
        // its quiz grade (score/total) as a decimal, so a module actually
        // mastered earns full credit and one scraped through on a weak
        // score earns proportionally less. quizStatusByModuleId is the
        // same snapshot the #205 gate check above already fetched — reused
        // here rather than queried again. A module with no quiz, or one
        // whose quiz hasn't been taken (shouldn't happen given the gate
        // above, but this is what "untaken" maps to if it somehow does),
        // gets the full 1.0 multiplier: no quiz means nothing to be
        // graded down by. This is a one-time, moment-of-completion
        // calculation — a later quiz retake changes future course-grade
        // reads (#240/#241) but deliberately does not reach back and
        // recompute points already logged here.
        const quizStatus = quizStatusByModuleId?.get(module.id);
        const gradeMultiplier =
          quizStatus?.hasQuiz && quizStatus.taken && quizStatus.total > 0
            ? (quizStatus.score ?? 0) / quizStatus.total
            : 1;
        const modulePoints = Math.round(basePointsPerModule * gradeMultiplier);

        await this.activityService.logModuleCompletion(
          userId,
          module.id,
          modulePoints,
        );
      }
    }

    // save() returns the same entity reference with its already-loaded
    // relations intact, so saved.course.modules (fetched above for the
    // totalModules calc) is still there — no need to re-query.
    return this.toResponseDto(saved);
  }

  private toResponseDto(enrollment: Enrollment): EnrollmentResponseDto {
    return {
      id: enrollment.id,
      courseId: enrollment.course.id,
      progress: enrollment.progress,
      status: enrollment.status,
      lastAccessed: enrollment.lastAccessed,
      createdAt: enrollment.createdAt,
      course: this.toEnrolledCourseDto(enrollment.course),
      rating: enrollment.rating,
      reviewText: enrollment.reviewText,
    };
  }

  // #106 — only a learner who has actually completed this course can rate
  // it (mirrors generateCertificate's same status check just below).
  // Re-submitting overwrites the previous rating rather than erroring,
  // since there's no reason to force a learner through "delete then
  // re-add" just to change their mind.
  async submitRating(
    userId: string,
    enrollmentId: string,
    dto: SubmitRatingDto,
  ): Promise<EnrollmentResponseDto> {
    const enrollment = await this.enrollmentsRepo.findOne({
      where: { id: enrollmentId },
      relations: { user: true, course: { modules: true } },
      order: { course: { modules: { position: 'ASC' } } },
    });

    if (!enrollment) {
      throw new NotFoundException(
        `Enrollment with id "${enrollmentId}" not found`,
      );
    }

    if (enrollment.user.id !== userId) {
      throw new ForbiddenException('This enrollment does not belong to you');
    }

    if (enrollment.status !== 'complete') {
      throw new BadRequestException(
        'You can only rate a course after completing it',
      );
    }

    enrollment.rating = dto.rating;
    // #228 — normalize "" / whitespace-only to null rather than storing it
    // as-is, so an empty textarea submission reads the same as never
    // having left a review (and doesn't show up as a blank entry in
    // getReviewsForCourse below, which filters on reviewText IS NOT NULL).
    const trimmedReview = dto.reviewText?.trim();
    enrollment.reviewText = trimmedReview ? trimmedReview : null;
    const saved = await this.enrollmentsRepo.save(enrollment);

    // #wire-course-rating-to-submissions — keep the Catalogue-facing
    // average in sync with real submissions. Previously Course.rating was
    // a static seed-time value that never moved regardless of what
    // learners actually rated (see the AddRatingToEnrollments migration
    // comment, which flagged this as a deliberate, explicit gap).
    await this.recalculateCourseRating(enrollment.course.id);

    return this.toResponseDto(saved);
  }

  // #wire-course-rating-to-submissions — recomputed on every submitRating
  // call rather than read live wherever courses are listed: ratings are
  // submitted far less often than course lists are fetched, so this keeps
  // Catalogue/Discover/CourseDetailModal reads cheap (no join/aggregate on
  // every fetch) at the cost of one small extra query here. Only touches
  // Course.rating once at least one real rating exists for the course —
  // until then the seeded baseline is left alone rather than being wiped
  // to null.
  private async recalculateCourseRating(courseId: string): Promise<void> {
    const result = await this.enrollmentsRepo
      .createQueryBuilder('enrollment')
      .leftJoin('enrollment.course', 'course')
      .select('AVG(enrollment.rating)', 'average')
      .where('course.id = :courseId', { courseId })
      .andWhere('enrollment.rating IS NOT NULL')
      .getRawOne<{ average: string | null }>();

    const average = result?.average ?? null;
    if (average === null) return;

    await this.coursesRepo.update(courseId, {
      rating: Math.round(Number(average) * 10) / 10,
    });
  }

  // #228 — public, course-scoped reviews list for CourseDetailModal: every
  // enrollment against this course that has actual review text, most
  // recent first. Ordered by the enrollment's createdAt (when the learner
  // enrolled) rather than a dedicated "rated at" timestamp, since #106
  // never added one — an enrollment only ever has one rating/review at a
  // time (re-rating overwrites, see submitRating above), so this is the
  // closest existing timestamp and good enough for "most recent reviews
  // first" without adding a new column just for ordering.
  async getReviewsForCourse(courseId: string): Promise<CourseReviewDto[]> {
    const enrollments = await this.enrollmentsRepo.find({
      where: { course: { id: courseId }, reviewText: Not(IsNull()) },
      relations: { user: true },
      order: { createdAt: 'DESC' },
    });

    return enrollments.map((e) => ({
      authorName: e.user.name || 'Encyclopedia Learner',
      rating: e.rating as number,
      reviewText: e.reviewText as string,
      createdAt: e.createdAt,
    }));
  }

  private toEnrolledCourseDto(course: Course): EnrolledCourseDto {
    return {
      id: course.id,
      title: course.title,
      modules: (course.modules ?? []).map((m) => ({
        id: m.id,
        position: m.position,
        title: m.title,
        videoUrl: m.videoUrl,
      })),
    };
  }

  async generateCertificate(
    userId: string,
    enrollmentId: string,
  ): Promise<Buffer> {
    const enrollment = await this.enrollmentsRepo.findOne({
      where: { id: enrollmentId },
      relations: { user: true, course: true },
    });

    if (!enrollment) {
      throw new NotFoundException(
        `Enrollment with id "${enrollmentId}" not found`,
      );
    }

    if (enrollment.user.id !== userId) {
      throw new ForbiddenException('This enrollment does not belong to you');
    }

    if (enrollment.status !== 'complete') {
      throw new BadRequestException(
        'Certificate is only available for completed courses',
      );
    }

    const learnerName = enrollment.user.name || 'Encyclopedia Learner';
    const courseTitle = enrollment.course.title;
    const completionDate = (
      enrollment.lastAccessed ?? new Date()
    ).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // #241/#260 — reuses ModulesService.getQuizResultsForCourse (already
    // injected here for #205's quiz-completion check) rather than a third
    // calculation of the same thing; the pooled grade/pass-tier math
    // itself lives in computeCourseGrade above, where it's directly
    // unit-tested.
    const moduleResults = await this.modulesService.getQuizResultsForCourse(
      userId,
      enrollment.course.id,
    );
    const { courseGradePct, passed } = computeCourseGrade(moduleResults);

    const pdfDoc = await PDFDocument.create();

    // #177 — pdf-lib's built-in StandardFonts only support WinAnsi
    // encoding (Latin-1), so any learner name with Vietnamese
    // diacritics (or other extended-Latin characters) threw an
    // uncaught "cannot encode" error here, surfacing to the frontend
    // as a plain 500. DejaVu Sans has full Vietnamese/extended-Latin
    // coverage; it's bundled under src/assets/fonts (copied to
    // dist/assets/fonts by nest-cli's asset config, see
    // nest-cli.json) and embedded via fontkit instead of relying on
    // the limited standard 14 fonts.
    pdfDoc.registerFontkit(fontkit);
    const fontsDir = join(__dirname, '../assets/fonts');
    const [regularBytes, boldBytes] = await Promise.all([
      readFile(join(fontsDir, 'DejaVuSans.ttf')),
      readFile(join(fontsDir, 'DejaVuSans-Bold.ttf')),
    ]);

    const page = pdfDoc.addPage([842, 595]); // A4 landscape, in points
    const { width, height } = page.getSize();

    const fontBold = await pdfDoc.embedFont(boldBytes);
    const fontRegular = await pdfDoc.embedFont(regularBytes);

    const ink = rgb(0.086, 0.137, 0.239); // matches --ink from the app's design tokens
    const gold = rgb(0.78, 0.6, 0.16);
    const slate = rgb(0.4, 0.44, 0.52);

    // #241 — Border, title, and the "has successfully completed" line are
    // the only things that change between tiers; a "Passed" certificate
    // is a thicker gold border and a gold (not ink) title on top of the
    // exact same layout, rather than a second, separately-designed
    // template — the issue calls for reusing this PDF generation, not
    // building a parallel one. When `passed` is false this renders
    // byte-for-byte the same certificate as before this issue.
    page.drawRectangle({
      x: 24,
      y: 24,
      width: width - 48,
      height: height - 48,
      borderColor: gold,
      borderWidth: passed ? 4 : 2,
    });

    const centerText = (
      text: string,
      y: number,
      font = fontRegular,
      size = 14,
      color = ink,
    ) => {
      const textWidth = font.widthOfTextAtSize(text, size);
      page.drawText(text, { x: (width - textWidth) / 2, y, size, font, color });
    };

    const title = passed
      ? 'CERTIFICATE OF ACHIEVEMENT'
      : 'CERTIFICATE OF COMPLETION';
    const completedLine = passed
      ? 'has successfully completed, with distinction,'
      : 'has successfully completed';
    // #241 — the grade only appears on the Passed tier; the Completed
    // tier's bottom line is deliberately identical to before this issue,
    // whether or not this course even has a grade to show.
    const bottomLine = passed
      ? `Course grade: ${courseGradePct}%  ·  Completed on ${completionDate}`
      : `Completed on ${completionDate}`;

    centerText(title, height - 120, fontBold, 22, passed ? gold : ink);
    centerText('This certifies that', height - 180, fontRegular, 14, slate);
    centerText(learnerName, height - 220, fontBold, 30, ink);
    centerText(completedLine, height - 265, fontRegular, 14, slate);
    centerText(courseTitle, height - 300, fontBold, 20, gold);
    centerText(bottomLine, height - 350, fontRegular, 12, slate);
    // #403 — "Encyclopedia Learning" -> just "Encyclopedia".
    centerText('Encyclopedia', height - 80, fontBold, 14, ink);

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }
}
