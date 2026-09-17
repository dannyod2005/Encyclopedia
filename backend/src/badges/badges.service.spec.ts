import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { BadgesService } from './badges.service';
import { UserBadge } from './entities/user-badge.entity';
import { NotificationsService } from '../notifications/notifications.service';

// #498 — BadgesService.award() is the single idempotent write every
// evaluate* trigger point (course completion, quiz submission, forum
// post) ultimately funnels through, and getBadgesForUser() is what the
// Dashboard badges card renders directly — a silent bug in either means
// a learner either never sees a badge they earned, or the app crashes/
// double-notifies on a race. These tests cover both, mocking the repo
// and NotificationsService the same way modules.service.spec.ts mocks
// ModulesService's dependencies.
describe('BadgesService', () => {
  let service: BadgesService;

  const mockUserBadgesRepo = { insert: jest.fn(), find: jest.fn() };
  const mockNotificationsService = { createForBadge: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BadgesService,
        { provide: getRepositoryToken(UserBadge), useValue: mockUserBadgesRepo },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    service = module.get<BadgesService>(BadgesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('award', () => {
    it('inserts the badge and notifies on a genuine first award', async () => {
      mockUserBadgesRepo.insert.mockResolvedValue({});

      await service.award('user-1', 'first_course_complete');

      expect(mockUserBadgesRepo.insert).toHaveBeenCalledWith({
        user: { id: 'user-1' },
        badgeKey: 'first_course_complete',
      });
      expect(mockNotificationsService.createForBadge).toHaveBeenCalledWith(
        'user-1',
        'first_course_complete',
      );
    });

    it('is a silent no-op (no notification) when the badge was already earned', async () => {
      const conflict = Object.create(QueryFailedError.prototype);
      conflict.code = '23505';
      mockUserBadgesRepo.insert.mockRejectedValue(conflict);

      await service.award('user-1', 'first_course_complete');

      expect(mockNotificationsService.createForBadge).not.toHaveBeenCalled();
    });

    it('rethrows an unrelated database error instead of swallowing it', async () => {
      const otherError = Object.create(QueryFailedError.prototype);
      otherError.code = '23502'; // not-null violation, unrelated to the unique constraint
      mockUserBadgesRepo.insert.mockRejectedValue(otherError);

      await expect(service.award('user-1', 'first_course_complete')).rejects.toBe(
        otherError,
      );
      expect(mockNotificationsService.createForBadge).not.toHaveBeenCalled();
    });
  });

  describe('evaluateCourseCompletion', () => {
    it('awards first_course_complete at exactly 1 completed course', async () => {
      mockUserBadgesRepo.insert.mockResolvedValue({});
      await service.evaluateCourseCompletion('user-1', 1);
      expect(mockUserBadgesRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ badgeKey: 'first_course_complete' }),
      );
      expect(mockUserBadgesRepo.insert).toHaveBeenCalledTimes(1);
    });

    it('awards five_courses_complete at exactly 5 completed courses', async () => {
      mockUserBadgesRepo.insert.mockResolvedValue({});
      await service.evaluateCourseCompletion('user-1', 5);
      expect(mockUserBadgesRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ badgeKey: 'five_courses_complete' }),
      );
      expect(mockUserBadgesRepo.insert).toHaveBeenCalledTimes(1);
    });

    it('awards nothing at a count that matches neither threshold', async () => {
      await service.evaluateCourseCompletion('user-1', 3);
      expect(mockUserBadgesRepo.insert).not.toHaveBeenCalled();
    });
  });

  describe('evaluateQuizSubmission', () => {
    it('awards perfect_quiz_score on a perfect score', async () => {
      mockUserBadgesRepo.insert.mockResolvedValue({});
      await service.evaluateQuizSubmission('user-1', 5, 5);
      expect(mockUserBadgesRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ badgeKey: 'perfect_quiz_score' }),
      );
    });

    it('does not award on a less-than-perfect score', async () => {
      await service.evaluateQuizSubmission('user-1', 4, 5);
      expect(mockUserBadgesRepo.insert).not.toHaveBeenCalled();
    });

    it('does not award when total is 0 (no quiz questions), even though score === total', async () => {
      await service.evaluateQuizSubmission('user-1', 0, 0);
      expect(mockUserBadgesRepo.insert).not.toHaveBeenCalled();
    });
  });

  describe('evaluateForumPost', () => {
    it('awards first_forum_post when this is the user\'s first post', async () => {
      mockUserBadgesRepo.insert.mockResolvedValue({});
      await service.evaluateForumPost('user-1', true);
      expect(mockUserBadgesRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ badgeKey: 'first_forum_post' }),
      );
    });

    it('does not award on a subsequent post', async () => {
      await service.evaluateForumPost('user-1', false);
      expect(mockUserBadgesRepo.insert).not.toHaveBeenCalled();
    });
  });

  describe('getBadgesForUser', () => {
    it('maps earned rows to their definition, oldest first', async () => {
      mockUserBadgesRepo.find.mockResolvedValue([
        { badgeKey: 'first_course_complete', earnedAt: new Date('2026-01-01') },
        { badgeKey: 'perfect_quiz_score', earnedAt: new Date('2026-02-01') },
      ]);

      const result = await service.getBadgesForUser('user-1');

      expect(mockUserBadgesRepo.find).toHaveBeenCalledWith({
        where: { user: { id: 'user-1' } },
        order: { earnedAt: 'ASC' },
      });
      expect(result).toEqual([
        {
          key: 'first_course_complete',
          label: 'First Steps',
          description: 'Completed your first course.',
          earnedAt: new Date('2026-01-01'),
        },
        {
          key: 'perfect_quiz_score',
          label: 'Perfect Score',
          description: 'Scored 100% on a module quiz.',
          earnedAt: new Date('2026-02-01'),
        },
      ]);
    });

    it('silently drops a badge_key with no matching definition instead of crashing', async () => {
      mockUserBadgesRepo.find.mockResolvedValue([
        { badgeKey: 'retired_badge_no_longer_defined', earnedAt: new Date('2026-01-01') },
        { badgeKey: 'first_forum_post', earnedAt: new Date('2026-01-02') },
      ]);

      const result = await service.getBadgesForUser('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('first_forum_post');
    });

    it('returns an empty array when the user has earned no badges', async () => {
      mockUserBadgesRepo.find.mockResolvedValue([]);
      const result = await service.getBadgesForUser('user-1');
      expect(result).toEqual([]);
    });
  });
});
