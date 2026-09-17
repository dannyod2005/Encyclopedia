import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { CourseAnalyticsService } from './course-analytics.service';
import { Course } from './entities/course.entity';
import { Enrollment } from '../enrollments/entities/enrollment.entity';
import { QuizQuestion } from '../quiz/entities/quiz-question.entity';
import { QuizSubmission } from '../quiz/entities/quiz-submission.entity';
import { Profile } from '../profiles/entities/profile.entity';
import { LearningPath } from '../learning-paths/entities/learning-path.entity';

// #498 — covers the per-learner flag logic (inactive/behindPace) and
// aggregate math behind the Trainer Studio analytics view, plus the
// trainer overview rollup's owned-vs-shared-vs-team-size branching.
// courseHours/dailyGoalPoints/date math is exercised indirectly through
// getAnalyticsForCourse's public output rather than testing the private
// isBehindPace directly.
describe('CourseAnalyticsService', () => {
  let service: CourseAnalyticsService;

  const mockCoursesRepo = { findOne: jest.fn(), find: jest.fn() };
  const mockEnrollmentsRepo = {
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const mockQuizQuestionsRepo = { find: jest.fn() };
  const mockQuizSubmissionsRepo = { find: jest.fn() };
  const mockProfilesRepo = { findOne: jest.fn(), count: jest.fn() };
  const mockLearningPathsRepo = { find: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CourseAnalyticsService,
        { provide: getRepositoryToken(Course), useValue: mockCoursesRepo },
        { provide: getRepositoryToken(Enrollment), useValue: mockEnrollmentsRepo },
        { provide: getRepositoryToken(QuizQuestion), useValue: mockQuizQuestionsRepo },
        { provide: getRepositoryToken(QuizSubmission), useValue: mockQuizSubmissionsRepo },
        { provide: getRepositoryToken(Profile), useValue: mockProfilesRepo },
        { provide: getRepositoryToken(LearningPath), useValue: mockLearningPathsRepo },
      ],
    }).compile();

    service = module.get<CourseAnalyticsService>(CourseAnalyticsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAnalyticsForCourse', () => {
    it('throws NotFoundException when the course does not exist', async () => {
      mockCoursesRepo.findOne.mockResolvedValue(null);

      await expect(service.getAnalyticsForCourse('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('converts the decimal-as-string progress column to a percentage', async () => {
      mockCoursesRepo.findOne.mockResolvedValue({ id: 'c1', hours: 10, modules: [] });
      mockEnrollmentsRepo.find.mockResolvedValue([
        {
          id: 'e1',
          progress: '0.5', // pg driver returns numeric columns as strings
          status: 'in-progress',
          lastAccessed: new Date(),
          createdAt: new Date(),
          user: { id: 'u1', name: 'Alice', dailyGoalPoints: 1500 },
        },
      ]);

      const result = await service.getAnalyticsForCourse('c1');

      expect(result.learners[0].progressPct).toBe(50);
    });

    it('computes quizAverageScorePct from this user\'s own submissions only', async () => {
      mockCoursesRepo.findOne.mockResolvedValue({
        id: 'c1',
        hours: 10,
        modules: [{ id: 'm1' }],
      });
      mockEnrollmentsRepo.find.mockResolvedValue([
        {
          id: 'e1',
          progress: '0.3',
          status: 'in-progress',
          lastAccessed: new Date(),
          createdAt: new Date(),
          user: { id: 'u1', name: 'Alice', dailyGoalPoints: 1500 },
        },
      ]);
      mockQuizQuestionsRepo.find.mockResolvedValue([{ id: 'q1' }, { id: 'q2' }]);
      mockQuizSubmissionsRepo.find.mockResolvedValue([
        { question: { id: 'q1' }, user: { id: 'u1' }, isCorrect: true },
        { question: { id: 'q2' }, user: { id: 'u1' }, isCorrect: false },
      ]);

      const result = await service.getAnalyticsForCourse('c1');

      expect(result.learners[0].quizAverageScorePct).toBe(50);
    });

    it('reports quizAverageScorePct as null when the learner has no submissions', async () => {
      mockCoursesRepo.findOne.mockResolvedValue({ id: 'c1', hours: 10, modules: [] });
      mockEnrollmentsRepo.find.mockResolvedValue([
        {
          id: 'e1',
          progress: '0',
          status: 'not-started',
          lastAccessed: null,
          createdAt: new Date(),
          user: { id: 'u1', name: 'Alice', dailyGoalPoints: 1500 },
        },
      ]);

      const result = await service.getAnalyticsForCourse('c1');

      expect(result.learners[0].quizAverageScorePct).toBeNull();
    });

    it('flags a learner inactive after 7+ days since last access, but never a completed one', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-02-01T00:00:00.000Z'));
      mockCoursesRepo.findOne.mockResolvedValue({ id: 'c1', hours: 10, modules: [] });
      mockEnrollmentsRepo.find.mockResolvedValue([
        {
          id: 'e-inactive',
          progress: '0.2',
          status: 'in-progress',
          lastAccessed: new Date('2026-01-01T00:00:00.000Z'), // 31 days ago
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          user: { id: 'u1', name: 'Inactive', dailyGoalPoints: 1500 },
        },
        {
          id: 'e-complete',
          progress: '1',
          status: 'complete',
          lastAccessed: new Date('2026-01-01T00:00:00.000Z'),
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          user: { id: 'u2', name: 'Finisher', dailyGoalPoints: 1500 },
        },
      ]);

      const result = await service.getAnalyticsForCourse('c1');

      const inactive = result.learners.find((l) => l.userId === 'u1');
      const complete = result.learners.find((l) => l.userId === 'u2');
      expect(inactive.flags.inactive).toBe(true);
      expect(complete.flags.inactive).toBe(false);
    });

    it('never flags behindPace when the course has no estimated hours', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-02-01T00:00:00.000Z'));
      mockCoursesRepo.findOne.mockResolvedValue({ id: 'c1', hours: 0, modules: [] });
      mockEnrollmentsRepo.find.mockResolvedValue([
        {
          id: 'e1',
          progress: '0',
          status: 'in-progress',
          lastAccessed: new Date('2026-01-01T00:00:00.000Z'),
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          user: { id: 'u1', name: 'Alice', dailyGoalPoints: 1500 },
        },
      ]);

      const result = await service.getAnalyticsForCourse('c1');

      expect(result.learners[0].flags.behindPace).toBe(false);
    });

    it('flags behindPace when real progress trails expected progress by more than the tolerance', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-02-01T00:00:00.000Z'));
      // 10-hour course = 6000 points needed (10 * 60 * 10). At a 1500/day
      // goal, expected ~4 days to finish. 31 days after enrolling with
      // only 20% progress is well behind.
      mockCoursesRepo.findOne.mockResolvedValue({ id: 'c1', hours: 10, modules: [] });
      mockEnrollmentsRepo.find.mockResolvedValue([
        {
          id: 'e1',
          progress: '0.2',
          status: 'in-progress',
          lastAccessed: new Date('2026-02-01T00:00:00.000Z'),
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          user: { id: 'u1', name: 'Alice', dailyGoalPoints: 1500 },
        },
      ]);

      const result = await service.getAnalyticsForCourse('c1');

      expect(result.learners[0].flags.behindPace).toBe(true);
    });

    it('computes averageCompletionPct/averageQuizScorePct across all learners, and defaults to 0/null with no enrollments', async () => {
      mockCoursesRepo.findOne.mockResolvedValue({ id: 'c1', hours: 10, modules: [] });
      mockEnrollmentsRepo.find.mockResolvedValue([]);

      const result = await service.getAnalyticsForCourse('c1');

      expect(result.enrollmentCount).toBe(0);
      expect(result.averageCompletionPct).toBe(0);
      expect(result.averageQuizScorePct).toBeNull();
    });
  });

  describe('getOverviewForOwner', () => {
    it('counts a trainer with no provider as a team of 1, and only queries owned rows', async () => {
      mockProfilesRepo.findOne.mockResolvedValue({ id: 'user-1', providerId: null });
      mockCoursesRepo.find.mockResolvedValue([]);
      mockLearningPathsRepo.find.mockResolvedValue([]);

      const result = await service.getOverviewForOwner('user-1');

      expect(result.teamSize).toBe(1);
      expect(mockProfilesRepo.count).not.toHaveBeenCalled();
      expect(mockCoursesRepo.find).toHaveBeenCalledWith({
        where: [{ ownerId: 'user-1', deletedAt: expect.anything() }],
      });
    });

    it('counts every provider member (including owner) as teamSize when the trainer has a provider', async () => {
      mockProfilesRepo.findOne.mockResolvedValue({ id: 'user-1', providerId: 'provider-1' });
      mockCoursesRepo.find.mockResolvedValue([]);
      mockLearningPathsRepo.find.mockResolvedValue([]);
      mockProfilesRepo.count.mockResolvedValue(4);

      const result = await service.getOverviewForOwner('user-1');

      expect(result.teamSize).toBe(4);
      expect(mockProfilesRepo.count).toHaveBeenCalledWith({
        where: { providerId: 'provider-1' },
      });
      expect(mockCoursesRepo.find).toHaveBeenCalledWith({
        where: [
          { ownerId: 'user-1', deletedAt: expect.anything() },
          { providerId: 'provider-1', deletedAt: expect.anything() },
        ],
      });
    });

    it('skips the totalStudents query entirely when the trainer owns no courses', async () => {
      mockProfilesRepo.findOne.mockResolvedValue({ id: 'user-1', providerId: null });
      mockCoursesRepo.find.mockResolvedValue([]);
      mockLearningPathsRepo.find.mockResolvedValue([]);

      const result = await service.getOverviewForOwner('user-1');

      expect(result.totalStudents).toBe(0);
      expect(mockEnrollmentsRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('counts distinct enrolled students across all owned courses via the query builder', async () => {
      mockProfilesRepo.findOne.mockResolvedValue({ id: 'user-1', providerId: null });
      mockCoursesRepo.find.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);
      mockLearningPathsRepo.find.mockResolvedValue([]);

      const qb = {
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ count: '7' }),
      };
      mockEnrollmentsRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getOverviewForOwner('user-1');

      expect(result.totalStudents).toBe(7);
      expect(qb.where).toHaveBeenCalledWith('course.id IN (:...courseIds)', {
        courseIds: ['c1', 'c2'],
      });
    });
  });
});
