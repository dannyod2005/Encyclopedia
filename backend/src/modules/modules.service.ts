import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, EntityManager } from 'typeorm';
import { CourseModule } from '../courses/entities/course-module.entity';
import { QuizQuestion } from '../quiz/entities/quiz-question.entity';
import { QuizSubmission } from '../quiz/entities/quiz-submission.entity';
import { Profile } from '../profiles/entities/profile.entity';
import { ModuleNote } from '../notes/entities/module-note.entity';
import { ForumPost } from '../forum/entities/forum-post.entity';
import { QuizQuestionResponseDto } from '../quiz/dto/quiz-question-response.dto';
import { SubmitQuizDto } from '../quiz/dto/submit-quiz.dto';
import { QuizResultDto } from '../quiz/dto/quiz-result.dto';
import { UpsertNoteDto } from '../notes/dto/upsert-note.dto';
import { NoteResponseDto } from '../notes/dto/note-response.dto';
import { CreatePostDto } from '../forum/dto/create-post.dto';
import { UpdatePostDto } from '../forum/dto/update-post.dto';
import { PostResponseDto } from '../forum/dto/post-response.dto';
import { UpsertQuizDto } from '../quiz/dto/upsert-quiz.dto';
import { QuizOption } from '../quiz/entities/quiz-option.entity';
import { QuizQuestionEditResponseDto } from '../quiz/dto/quiz-question-edit-response.dto';
import { ModuleQuizResultDto } from '../quiz/dto/module-quiz-result.dto';
import { ModuleQuizQuestionCountDto } from '../quiz/dto/module-quiz-question-count.dto';
import {
  ActivityService,
  POINTS_PER_MINUTE,
} from '../activity/activity.service';
import { BadgesService } from '../badges/badges.service';
import { NotificationsService } from '../notifications/notifications.service';

// Fixed per-event point estimates for actions that aren't naturally
// scaled by course length the way module completion is (see #37). #246 —
// the same "minutes" figures as before (5/3/3), just multiplied through
// POINTS_PER_MINUTE like every other flat estimate in this migration.
const QUIZ_SUBMIT_POINTS = 5 * POINTS_PER_MINUTE;
const NOTE_SAVE_POINTS = 3 * POINTS_PER_MINUTE;
const FORUM_POST_POINTS = 3 * POINTS_PER_MINUTE;

function isEdited(post: ForumPost): boolean {
  return post.updatedAt.getTime() !== post.createdAt.getTime();
}

// #40 — auto-grading match rule for short-answer questions: trimmed,
// case-insensitive comparison against each acceptable answer. Simple on
// purpose (the decision was keyword/exact-match, not fuzzy/NLP-based
// grading) — a learner's answer is correct if it matches any one
// acceptable answer for the question after normalizing both sides.
function normalizeAnswer(text: string): string {
  return text.trim().toLowerCase();
}

@Injectable()
export class ModulesService {
  constructor(
    @InjectRepository(CourseModule)
    private readonly modulesRepo: Repository<CourseModule>,
    @InjectRepository(QuizQuestion)
    private readonly quizQuestionsRepo: Repository<QuizQuestion>,
    @InjectRepository(QuizSubmission)
    private readonly quizSubmissionsRepo: Repository<QuizSubmission>,
    @InjectRepository(Profile)
    private readonly profilesRepo: Repository<Profile>,
    @InjectRepository(ModuleNote)
    private readonly notesRepo: Repository<ModuleNote>,
    @InjectRepository(ForumPost)
    private readonly forumPostsRepo: Repository<ForumPost>,
    private readonly activityService: ActivityService,
    private readonly badgesService: BadgesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getQuiz(moduleId: string): Promise<QuizQuestionResponseDto[]> {
    const module = await this.modulesRepo.findOne({ where: { id: moduleId } });
    if (!module) {
      throw new NotFoundException(`Module with id "${moduleId}" not found`);
    }

    const questions = await this.quizQuestionsRepo.find({
      where: { module: { id: moduleId } },
      relations: { options: true },
      order: {
        position: 'ASC',
        options: { position: 'ASC' },
      },
    });

    return questions.map((q) => ({
      id: q.id,
      question: q.question,
      position: q.position,
      type: q.type,
      // #40 — a short_answer question's options are its answer key, not
      // choices to render — never sent to the learner-facing endpoint.
      options:
        q.type === 'short_answer'
          ? []
          : q.options.map((o) => ({
              id: o.id,
              optionText: o.optionText,
              position: o.position,
            })),
    }));
  }

  async submitQuiz(
    userId: string,
    moduleId: string,
    dto: SubmitQuizDto,
  ): Promise<QuizResultDto> {
    const profile = await this.profilesRepo.findOne({ where: { id: userId } });
    if (!profile) {
      throw new NotFoundException('Profile not found for this user');
    }

    const module = await this.modulesRepo.findOne({ where: { id: moduleId } });
    if (!module) {
      throw new NotFoundException(`Module with id "${moduleId}" not found`);
    }

    const questions = await this.quizQuestionsRepo.find({
      where: { module: { id: moduleId } },
      relations: { options: true },
    });

    if (questions.length === 0) {
      throw new NotFoundException('This module has no quiz');
    }

    // Lookup from every question to its options/acceptable-answers —
    // used by both the "already submitted" path and the fresh-grading
    // path below, so grading is always derived from real question data,
    // never trusted from the client.
    const questionById = new Map(questions.map((q) => [q.id, q]));

    // #40 — builds the response shape for a graded-and-stored submission
    // (isCorrect lives on the submission itself now, for both question
    // types — see the QuizSubmission entity comment).
    const buildResultItem = (
      question: QuizQuestion,
      submission: {
        option: { id: string } | null;
        answerText: string | null;
        isCorrect: boolean;
      },
    ): QuizResultDto['results'][number] => {
      if (question.type === 'short_answer') {
        return {
          questionId: question.id,
          type: 'short_answer',
          isCorrect: submission.isCorrect,
          submittedText: submission.answerText ?? undefined,
          acceptableAnswers: question.options.map((o) => o.optionText),
        };
      }

      const correctOption = question.options.find((o) => o.isCorrect);
      if (!correctOption) {
        // Data-integrity issue: an MCQ question with no correct answer
        // marked at all. Should be unreachable with well-formed quiz
        // data, but worth surfacing loudly rather than a bad result.
        throw new Error(
          `Question "${question.id}" has no option marked as correct`,
        );
      }

      return {
        questionId: question.id,
        type: 'mcq',
        isCorrect: submission.isCorrect,
        selectedOptionId: submission.option?.id,
        correctOptionId: correctOption.id,
      };
    };

    // #239 — was this a retake (had a prior submission) or a genuine
    // first attempt? Purely informational for the response below —
    // every submission is graded fresh from what was just sent, see the
    // delete-then-insert further down, so this count doesn't gate
    // anything.
    const priorSubmissionCount = await this.quizSubmissionsRepo.count({
      where: {
        user: { id: userId },
        question: { id: In([...questionById.keys()]) },
      },
    });
    const isRetake = priorSubmissionCount > 0;

    // Validate the answers cover exactly this module's questions — no
    // missing, no extra — and that each answer has the right shape for
    // its question's type, before grading or storing anything. Required
    // on a retake too — resubmitting means answering the whole quiz
    // again, not patching individual questions.
    const submittedQuestionIds = new Set(dto.answers.map((a) => a.questionId));
    const realQuestionIds = new Set(questions.map((q) => q.id));

    if (
      submittedQuestionIds.size !== realQuestionIds.size ||
      ![...submittedQuestionIds].every((id) => realQuestionIds.has(id))
    ) {
      throw new BadRequestException(
        "Answers must cover exactly the questions in this module's quiz",
      );
    }

    for (const answer of dto.answers) {
      const question = questionById.get(answer.questionId);
      if (!question) {
        // Unreachable given the exact-match check above, but keeps this
        // loop self-contained and satisfies TypeScript honestly rather
        // than asserting past it.
        throw new BadRequestException(
          `Unknown question "${answer.questionId}"`,
        );
      }

      if (question.type === 'short_answer') {
        if (!answer.answerText || !answer.answerText.trim()) {
          throw new BadRequestException(
            `Question "${answer.questionId}" requires answerText`,
          );
        }
      } else {
        if (!answer.optionId) {
          throw new BadRequestException(
            `Question "${answer.questionId}" requires optionId`,
          );
        }
        const optionBelongsToQuestion = question.options.some(
          (o) => o.id === answer.optionId,
        );
        if (!optionBelongsToQuestion) {
          throw new BadRequestException(
            `Option "${answer.optionId}" does not belong to question "${answer.questionId}"`,
          );
        }
      }
    }

    // Grade every answer once, up front — isCorrect gets persisted on
    // the submission (#40), not re-derived on every future read.
    const graded = dto.answers.map((a) => {
      const question = questionById.get(a.questionId)!; // validated above
      if (question.type === 'short_answer') {
        const acceptable = question.options.map((o) =>
          normalizeAnswer(o.optionText),
        );
        const isCorrect = acceptable.includes(normalizeAnswer(a.answerText!));
        return { answer: a, question, isCorrect };
      }
      const selected = question.options.find((o) => o.id === a.optionId);
      return { answer: a, question, isCorrect: !!selected?.isCorrect };
    });

    // #239 — unlimited retakes: a resubmission replaces the learner's
    // prior answers for this module entirely rather than accumulating a
    // second set of rows alongside the first. Deleting before inserting
    // keeps exactly one QuizSubmission per (user, question) at all
    // times, which is what every downstream reader assumes — this
    // module's own getQuizResultsForCourse below, CourseAnalyticsService's
    // per-learner quiz average, and the perfect-score badge check all
    // just pool "this user's submissions" without expecting more than
    // one per question. A no-op delete (nothing to remove) is harmless
    // on a genuine first attempt.
    await this.quizSubmissionsRepo.delete({
      user: { id: userId },
      question: { id: In([...questionById.keys()]) },
    });

    const submissionsToSave = graded.map((g) =>
      this.quizSubmissionsRepo.create({
        user: profile,
        question: g.question,
        option: g.question.type === 'mcq' ? { id: g.answer.optionId } : null,
        answerText:
          g.question.type === 'short_answer' ? g.answer.answerText : null,
        isCorrect: g.isCorrect,
      }),
    );
    await this.quizSubmissionsRepo.save(submissionsToSave);
    // #239 — logged on every submission, retakes included: reanswering
    // every question is real, fresh work (the validation above requires
    // a complete set of answers again, not a shortcut), so it earns
    // activity points the same as a first attempt does.
    await this.activityService.logEvent(
      userId,
      'quiz_submit',
      QUIZ_SUBMIT_POINTS,
    );

    // #225/#239 — perfect-score badge, evaluated on every fresh grading
    // pass, including retakes — award() is idempotent, so a learner who
    // already has this badge just no-ops here, and one who newly hits
    // 100% on a retake earns it exactly when they should.
    const score = graded.filter((g) => g.isCorrect).length;
    await this.badgesService.evaluateQuizSubmission(
      userId,
      score,
      questions.length,
    );

    const results = graded.map((g) =>
      buildResultItem(g.question, {
        option: g.question.type === 'mcq' ? { id: g.answer.optionId! } : null,
        answerText:
          g.question.type === 'short_answer' ? g.answer.answerText! : null,
        isCorrect: g.isCorrect,
      }),
    );

    return {
      score: results.filter((r) => r.isCorrect).length,
      total: questions.length,
      // #239 — repurposed from its old "returning stale, previously-
      // graded data" meaning (that path no longer exists — every
      // response here is a fresh grade) to "this attempt replaced a
      // prior one," so the frontend can label a retake's result
      // differently from a first attempt.
      alreadySubmitted: isRetake,
      results,
    };
  }

  // #82 — one row per module in the course, for LearningScreen's "Grades"
  // panel overview. Deliberately queries course_modules directly by
  // course id rather than going through CoursesService.findOne (which
  // filters out soft-deleted courses, #41) — an enrolled learner viewing
  // grades for a course a trainer has since deleted should keep working,
  // same principle as the enrollment/dashboard fix.
  async getQuizResultsForCourse(
    userId: string,
    courseId: string,
  ): Promise<ModuleQuizResultDto[]> {
    const modules = await this.modulesRepo.find({
      where: { course: { id: courseId } },
      order: { position: 'ASC' },
    });

    if (modules.length === 0) {
      return [];
    }

    const moduleIds = modules.map((m) => m.id);
    // #40 — no longer needs the options relation here at all: scoring
    // now reads submission.isCorrect directly (stored at submission
    // time) instead of re-deriving it via option.isCorrect, and the
    // module grouping below only needs each question's id/module.
    const questions = await this.quizQuestionsRepo.find({
      where: { module: { id: In(moduleIds) } },
      relations: { module: true },
    });

    const questionIds = questions.map((q) => q.id);
    const submissions =
      questionIds.length > 0
        ? await this.quizSubmissionsRepo.find({
            where: { user: { id: userId }, question: { id: In(questionIds) } },
            relations: { question: true },
          })
        : [];

    const questionsByModuleId = new Map<string, QuizQuestion[]>();
    for (const q of questions) {
      const list = questionsByModuleId.get(q.module.id) ?? [];
      list.push(q);
      questionsByModuleId.set(q.module.id, list);
    }

    return modules.map((module) => {
      const moduleQuestions = questionsByModuleId.get(module.id) ?? [];
      if (moduleQuestions.length === 0) {
        return {
          moduleId: module.id,
          moduleTitle: module.title,
          hasQuiz: false,
          taken: false,
          score: null,
          total: 0,
        };
      }

      const moduleQuestionIds = new Set(moduleQuestions.map((q) => q.id));
      const moduleSubmissions = submissions.filter((s) =>
        moduleQuestionIds.has(s.question.id),
      );

      if (moduleSubmissions.length === 0) {
        return {
          moduleId: module.id,
          moduleTitle: module.title,
          hasQuiz: true,
          taken: false,
          score: null,
          total: moduleQuestions.length,
        };
      }

      return {
        moduleId: module.id,
        moduleTitle: module.title,
        hasQuiz: true,
        taken: true,
        score: moduleSubmissions.filter((s) => s.isCorrect).length,
        total: moduleQuestions.length,
      };
    });
  }

  // (module-estimate fix) — lightweight per-module question count for
  // TrainerCourseEditor's time estimate, which needs this for every module
  // as soon as the edit form loads (previously it stayed at 0 until a
  // trainer opened each module's "Manage quiz" panel, since that's the only
  // thing that ever fetched question data). Deliberately count-only, not
  // the full quiz payload getQuizForEdit returns per module — one query for
  // the whole course instead of N, since the form needs this for every
  // module up front, not just whichever one a trainer happens to expand.
  // Same modules-then-questions shape as getQuizResultsForCourse above,
  // minus the submissions half (this is authoring data, not a specific
  // learner's results).
  async getQuizQuestionCountsForCourse(
    courseId: string,
  ): Promise<ModuleQuizQuestionCountDto[]> {
    const modules = await this.modulesRepo.find({
      where: { course: { id: courseId } },
      order: { position: 'ASC' },
    });

    if (modules.length === 0) {
      return [];
    }

    const moduleIds = modules.map((m) => m.id);
    const questions = await this.quizQuestionsRepo.find({
      where: { module: { id: In(moduleIds) } },
      relations: { module: true },
    });

    const countByModuleId = new Map<string, number>();
    for (const q of questions) {
      countByModuleId.set(
        q.module.id,
        (countByModuleId.get(q.module.id) ?? 0) + 1,
      );
    }

    return modules.map((module) => ({
      moduleId: module.id,
      questionCount: countByModuleId.get(module.id) ?? 0,
    }));
  }

  // #124 — called once per module focus from the frontend (fire-and-forget,
  // no response body needed). Existence-checks the module for a clean 404
  // like the other module-scoped endpoints, but deliberately doesn't
  // bother looking up the profile first the way saveNote does — there's no
  // row to attach it to besides the activity_events insert itself, and
  // ActivityService.logModuleView already dedupes per (user, module, day),
  // so a lookup here would just be extra latency on a lightweight ping.
  async logView(userId: string, moduleId: string): Promise<void> {
    const module = await this.modulesRepo.findOne({ where: { id: moduleId } });
    if (!module) {
      throw new NotFoundException(`Module with id "${moduleId}" not found`);
    }

    await this.activityService.logModuleView(userId, moduleId);
  }

  async getNote(userId: string, moduleId: string): Promise<NoteResponseDto> {
    const module = await this.modulesRepo.findOne({ where: { id: moduleId } });
    if (!module) {
      throw new NotFoundException(`Module with id "${moduleId}" not found`);
    }

    const note = await this.notesRepo.findOne({
      where: { module: { id: moduleId }, user: { id: userId } },
    });

    return {
      content: note?.content ?? null,
      updatedAt: note?.updatedAt ?? null,
    };
  }

  async saveNote(
    userId: string,
    moduleId: string,
    dto: UpsertNoteDto,
  ): Promise<NoteResponseDto> {
    const profile = await this.profilesRepo.findOne({ where: { id: userId } });
    if (!profile) {
      throw new NotFoundException('Profile not found for this user');
    }

    const module = await this.modulesRepo.findOne({ where: { id: moduleId } });
    if (!module) {
      throw new NotFoundException(`Module with id "${moduleId}" not found`);
    }

    let note = await this.notesRepo.findOne({
      where: { module: { id: moduleId }, user: { id: userId } },
    });

    if (note) {
      note.content = dto.content ?? null;
    } else {
      note = this.notesRepo.create({
        module,
        user: profile,
        content: dto.content ?? null,
      });
    }

    const saved = await this.notesRepo.save(note);
    // #314 — logNoteSave (not logEvent directly): debounced autosave
    // (#293) calls this on every ~1.2s typing pause, so the points award
    // needs the same once-per-(user, module)-per-day dedup logModuleView
    // already uses, or normal note-taking mints a fresh award on every
    // pause.
    await this.activityService.logNoteSave(userId, moduleId, NOTE_SAVE_POINTS);

    return {
      content: saved.content,
      updatedAt: saved.updatedAt,
    };
  }

  async listPosts(moduleId: string): Promise<PostResponseDto[]> {
    const module = await this.modulesRepo.findOne({ where: { id: moduleId } });
    if (!module) {
      throw new NotFoundException(`Module with id "${moduleId}" not found`);
    }

    const posts = await this.forumPostsRepo.find({
      where: { module: { id: moduleId } },
      relations: { user: true, parentPost: true },
      order: { createdAt: 'ASC' },
    });

    return posts.map((p) => ({
      id: p.id,
      content: p.content,
      createdAt: p.createdAt,
      author: {
        id: p.user.id,
        name: p.user.name,
      },
      parentPostId: p.parentPost?.id ?? null,
      edited: isEdited(p),
    }));
  }

  async createPost(
    userId: string,
    moduleId: string,
    dto: CreatePostDto,
  ): Promise<PostResponseDto> {
    const profile = await this.profilesRepo.findOne({ where: { id: userId } });
    if (!profile) {
      throw new NotFoundException('Profile not found for this user');
    }

    const module = await this.modulesRepo.findOne({ where: { id: moduleId } });
    if (!module) {
      throw new NotFoundException(`Module with id "${moduleId}" not found`);
    }

    let parentPost: ForumPost | null = null;
    if (dto.parentPostId) {
      // #229 — user (not just module) loaded here too: it's the original
      // author, needed below to decide whether this reply earns them a
      // notification.
      parentPost = await this.forumPostsRepo.findOne({
        where: { id: dto.parentPostId },
        relations: { module: true, user: true },
      });
      if (!parentPost) {
        throw new NotFoundException(
          `Post with id "${dto.parentPostId}" not found`,
        );
      }
      // Never trust a client-supplied parentPostId to actually belong to
      // this module — replying to a post from a different module would
      // otherwise let a reply show up somewhere it doesn't belong.
      if (parentPost.module.id !== moduleId) {
        throw new BadRequestException(
          'parentPostId does not belong to this module',
        );
      }
    }

    const post = this.forumPostsRepo.create({
      module,
      user: profile,
      content: dto.content,
      parentPost,
    });

    const saved = await this.forumPostsRepo.save(post);
    await this.activityService.logEvent(
      userId,
      'forum_post',
      FORUM_POST_POINTS,
    );

    // #225 — "first ever post" badge. Counted after save() so the post
    // just created is included — a count of exactly 1 means this was it.
    const totalPosts = await this.forumPostsRepo.count({
      where: { user: { id: userId } },
    });
    await this.badgesService.evaluateForumPost(userId, totalPosts === 1);

    // #229 — a reply notifies the original post's author, skipping the
    // self-reply case (someone replying to their own post shouldn't
    // notify themselves). Only fires for an actual reply (parentPost set)
    // — a fresh top-level post has no one to notify.
    if (parentPost && parentPost.user.id !== userId) {
      await this.notificationsService.createForReply(
        parentPost.user,
        profile,
        saved,
      );
    }

    return {
      id: saved.id,
      content: saved.content,
      createdAt: saved.createdAt,
      author: {
        id: profile.id,
        name: profile.name,
      },
      parentPostId: parentPost?.id ?? null,
      edited: isEdited(saved),
    };
  }

  async editPost(
    userId: string,
    moduleId: string,
    postId: string,
    dto: UpdatePostDto,
  ): Promise<PostResponseDto> {
    const post = await this.forumPostsRepo.findOne({
      where: { id: postId, module: { id: moduleId } },
      relations: { user: true, parentPost: true },
    });
    if (!post) {
      throw new NotFoundException(`Post with id "${postId}" not found`);
    }

    // Ownership check: only the post's own author can edit it — never
    // trust the client to only send its own posts, same principle as
    // enrollment/note ownership checks elsewhere in this service.
    if (post.user.id !== userId) {
      throw new ForbiddenException('You can only edit your own posts');
    }

    post.content = dto.content;
    const saved = await this.forumPostsRepo.save(post);

    return {
      id: saved.id,
      content: saved.content,
      createdAt: saved.createdAt,
      author: {
        id: post.user.id,
        name: post.user.name,
      },
      parentPostId: post.parentPost?.id ?? null,
      edited: isEdited(saved),
    };
  }

  async upsertQuiz(
    moduleId: string,
    dto: UpsertQuizDto,
  ): Promise<QuizQuestionResponseDto[]> {
    const module = await this.modulesRepo.findOne({ where: { id: moduleId } });
    if (!module) {
      throw new NotFoundException(`Module with id "${moduleId}" not found`);
    }

    for (const q of dto.questions) {
      const type = q.type ?? 'mcq';
      if (type === 'mcq') {
        const correctCount = (q.options ?? []).filter(
          (o) => o.isCorrect,
        ).length;
        if (correctCount !== 1) {
          throw new BadRequestException(
            `Question "${q.question}" must have exactly one correct option (found ${correctCount})`,
          );
        }
      } else if (!q.acceptableAnswers || q.acceptableAnswers.length === 0) {
        // Belt-and-suspenders — UpsertQuizDto's @ValidateIf already
        // requires this, but a question-level check here keeps the
        // error message specific to which question is missing it.
        throw new BadRequestException(
          `Question "${q.question}" needs at least one acceptable answer`,
        );
      }
    }

    return this.quizQuestionsRepo.manager.transaction(
      async (manager: EntityManager) => {
        const existingQuestions = await manager.find(QuizQuestion, {
          where: { module: { id: moduleId } },
          relations: { options: true },
        });

        const incomingQuestionIds = new Set(
          dto.questions.map((q) => q.id).filter((id): id is string => !!id),
        );
        const questionsToDelete = existingQuestions.filter(
          (q) => !incomingQuestionIds.has(q.id),
        );
        if (questionsToDelete.length > 0) {
          await manager.delete(
            QuizQuestion,
            questionsToDelete.map((q) => q.id),
          );
        }

        // MCQ options are matched/edited/deleted by id (a trainer's edits
        // to individual options should update those exact rows, since a
        // learner's MCQ submission references option_id directly). Done
        // up front for every still-present mcq question, before the main
        // per-question loop below.
        for (const existingQ of existingQuestions) {
          if (!incomingQuestionIds.has(existingQ.id)) continue;
          const incomingQ = dto.questions.find((q) => q.id === existingQ.id);
          if (!incomingQ || (incomingQ.type ?? 'mcq') !== 'mcq') continue;

          const incomingOptionIds = new Set(
            (incomingQ.options ?? [])
              .map((o) => o.id)
              .filter((id): id is string => !!id),
          );
          const optionsToDelete = existingQ.options.filter(
            (o) => !incomingOptionIds.has(o.id),
          );
          if (optionsToDelete.length > 0) {
            await manager.delete(
              QuizOption,
              optionsToDelete.map((o) => o.id),
            );
          }
        }

        const existingQuestionById = new Map(
          existingQuestions.map((q) => [q.id, q]),
        );

        for (const [qIndex, q] of dto.questions.entries()) {
          const type = q.type ?? 'mcq';
          let questionEntity: QuizQuestion;
          const matchedExisting = q.id
            ? existingQuestionById.get(q.id)
            : undefined;

          if (matchedExisting) {
            matchedExisting.question = q.question;
            matchedExisting.position = qIndex;
            matchedExisting.type = type;
            questionEntity = await manager.save(QuizQuestion, matchedExisting);
          } else {
            const created = manager.create(QuizQuestion, {
              module,
              question: q.question,
              position: qIndex,
              type,
            });
            questionEntity = await manager.save(QuizQuestion, created);
          }

          if (type === 'mcq') {
            const existingOptionById = new Map(
              (matchedExisting?.options ?? []).map((o) => [o.id, o]),
            );

            for (const [oIndex, o] of (q.options ?? []).entries()) {
              const matchedOption = o.id
                ? existingOptionById.get(o.id)
                : undefined;

              if (matchedOption) {
                matchedOption.optionText = o.optionText;
                matchedOption.isCorrect = o.isCorrect;
                matchedOption.position = oIndex;
                await manager.save(QuizOption, matchedOption);
              } else {
                const createdOption = manager.create(QuizOption, {
                  question: questionEntity,
                  optionText: o.optionText,
                  isCorrect: o.isCorrect,
                  position: oIndex,
                });
                await manager.save(QuizOption, createdOption);
              }
            }
          } else {
            // #40 — short_answer acceptable answers are plain strings from
            // the trainer's editor, not id-tracked rows, so the simplest
            // correct approach is replace-on-save rather than the MCQ
            // match-by-id dance above. Safe to do unconditionally: unlike
            // MCQ options, nothing ever points an option_id at one of
            // these rows (a short-answer submission stores answer_text
            // directly — see the QuizSubmission entity), so there's no
            // risk of cascade-deleting a learner's prior submissions by
            // replacing these.
            if (matchedExisting?.options?.length) {
              await manager.delete(
                QuizOption,
                matchedExisting.options.map((o) => o.id),
              );
            }
            const acceptableAnswers = q.acceptableAnswers ?? [];
            await manager.save(
              QuizOption,
              acceptableAnswers.map((text, oIndex) =>
                manager.create(QuizOption, {
                  question: questionEntity,
                  optionText: text,
                  isCorrect: true,
                  position: oIndex,
                }),
              ),
            );
          }
        }

        // Read back through the same transactional manager, not
        // this.quizQuestionsRepo — that repo uses a separate connection
        // which, under READ COMMITTED, can't see these writes until this
        // transaction commits (commit happens only after this callback
        // returns). Reading through `manager` sees the writes immediately.
        return this.fetchQuizForEdit(moduleId, manager);
      },
    );
  }

  async getQuizForEdit(
    moduleId: string,
  ): Promise<QuizQuestionEditResponseDto[]> {
    const module = await this.modulesRepo.findOne({ where: { id: moduleId } });
    if (!module) {
      throw new NotFoundException(`Module with id "${moduleId}" not found`);
    }

    return this.fetchQuizForEdit(moduleId, this.quizQuestionsRepo.manager);
  }

  private async fetchQuizForEdit(
    moduleId: string,
    manager: EntityManager,
  ): Promise<QuizQuestionEditResponseDto[]> {
    const questions = await manager.find(QuizQuestion, {
      where: { module: { id: moduleId } },
      relations: { options: true },
      order: {
        position: 'ASC',
        options: { position: 'ASC' },
      },
    });

    return questions.map((q) => ({
      id: q.id,
      question: q.question,
      position: q.position,
      type: q.type,
      options: q.options.map((o) => ({
        id: o.id,
        optionText: o.optionText,
        isCorrect: o.isCorrect,
        position: o.position,
      })),
    }));
  }
}
