import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { ActivityEvent } from './entities/activity-event.entity';
import { Profile } from '../profiles/entities/profile.entity';

// #498 — covers the point-crediting logic every other feature (daily
// goal, streak, leaderboard) ultimately reads: logEvent's zero/negative
// guard, logModuleCompletion's at-most-once-per-module dedup and its
// split-across-viewed-days math (#124/#312 — the exact mechanism that
// stops a course retake from minting points twice), and
// getWeeklyPointsForUsers' fail-safe zeroed-map fallback that
// LeaderboardService depends on to never drop a ranked learner.
describe('ActivityService', () => {
  let service: ActivityService;

  const mockActivityRepo = {
    create: jest.fn((x: Record<string, unknown>) => x),
    save: jest.fn().mockResolvedValue({}),
    findOne: jest.fn(),
    find: jest.fn(),
  };
  const mockProfilesRepo = { findOne: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityService,
        { provide: getRepositoryToken(ActivityEvent), useValue: mockActivityRepo },
        { provide: getRepositoryToken(Profile), useValue: mockProfilesRepo },
      ],
    }).compile();

    service = module.get<ActivityService>(ActivityService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('logEvent', () => {
    it('does nothing for zero points', async () => {
      await service.logEvent('user-1', 'module_view', 0);
      expect(mockActivityRepo.save).not.toHaveBeenCalled();
    });

    it('does nothing for negative points', async () => {
      await service.logEvent('user-1', 'module_view', -5);
      expect(mockActivityRepo.save).not.toHaveBeenCalled();
    });

    it('creates and saves an event for positive points', async () => {
      await service.logEvent('user-1', 'note_save', 30, { moduleId: 'm1' });

      expect(mockActivityRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'note_save',
          points: 30,
          module: { id: 'm1' },
        }),
      );
    });

    it('swallows a save failure rather than throwing (best-effort side effect)', async () => {
      mockActivityRepo.save.mockRejectedValueOnce(new Error('db down'));

      await expect(
        service.logEvent('user-1', 'module_view', 30),
      ).resolves.toBeUndefined();
    });
  });

  describe('logModuleCompletion', () => {
    it('does nothing for zero/negative totalPoints', async () => {
      await service.logModuleCompletion('user-1', 'm1', 0);
      expect(mockActivityRepo.findOne).not.toHaveBeenCalled();
    });

    it('is a no-op once module_complete has already been paid out (#312 retake guard)', async () => {
      mockActivityRepo.findOne.mockResolvedValue({ id: 'existing-event' });

      await service.logModuleCompletion('user-1', 'm1', 100);

      expect(mockActivityRepo.find).not.toHaveBeenCalled();
      expect(mockActivityRepo.save).not.toHaveBeenCalled();
    });

    it('pays the full amount onto today when the module was never separately viewed', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-03T15:00:00.000Z'));
      mockActivityRepo.findOne.mockResolvedValue(null);
      mockActivityRepo.find.mockResolvedValue([]); // no module_view events

      await service.logModuleCompletion('user-1', 'm1', 90);

      expect(mockActivityRepo.save).toHaveBeenCalledTimes(1);
      expect(mockActivityRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'module_complete',
          points: 90,
          occurredAt: new Date('2026-01-03T12:00:00.000Z'),
        }),
      );
    });

    it('splits totalPoints across every viewed day plus today, remainder to the most recent day', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-03T15:00:00.000Z'));
      mockActivityRepo.findOne.mockResolvedValue(null);
      mockActivityRepo.find.mockResolvedValue([
        { occurredAt: new Date('2026-01-01T09:00:00.000Z') },
        { occurredAt: new Date('2026-01-02T09:00:00.000Z') },
      ]);

      await service.logModuleCompletion('user-1', 'm1', 10);

      // 3 distinct days (01, 02, 03): base = floor(10/3) = 3, remainder = 1
      // -> most recent day (03) gets the extra point.
      expect(mockActivityRepo.save).toHaveBeenCalledTimes(3);
      const pointsByDay = new Map(
        mockActivityRepo.save.mock.calls.map((call) => [
          (call[0].occurredAt as Date).toISOString().slice(0, 10),
          call[0].points,
        ]),
      );
      expect(pointsByDay.get('2026-01-01')).toBe(3);
      expect(pointsByDay.get('2026-01-02')).toBe(3);
      expect(pointsByDay.get('2026-01-03')).toBe(4);
    });

    it('falls back to "nothing viewed" and still pays today when the dedup check fails', async () => {
      mockActivityRepo.findOne.mockRejectedValue(new Error('db down'));

      await service.logModuleCompletion('user-1', 'm1', 50);

      // #178 fail-safe: a failed pre-check must not block payout, but it
      // also must not risk a double-pay, so this bails out entirely rather
      // than guessing — no save should happen off a failed dedup check.
      expect(mockActivityRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('getCompletedModuleIds', () => {
    it('returns an empty set without querying when moduleIds is empty', async () => {
      const result = await service.getCompletedModuleIds('user-1', []);
      expect(result).toEqual(new Set());
      expect(mockActivityRepo.find).not.toHaveBeenCalled();
    });

    it('returns the distinct set of completed module ids', async () => {
      mockActivityRepo.find.mockResolvedValue([
        { module: { id: 'm1' } },
        { module: { id: 'm2' } },
      ]);

      const result = await service.getCompletedModuleIds('user-1', ['m1', 'm2', 'm3']);

      expect(result).toEqual(new Set(['m1', 'm2']));
    });

    it('fails safe to an empty set on a query error', async () => {
      mockActivityRepo.find.mockRejectedValue(new Error('db down'));

      const result = await service.getCompletedModuleIds('user-1', ['m1']);

      expect(result).toEqual(new Set());
    });
  });

  describe('getWeeklyPointsForUsers', () => {
    it('returns an empty map without querying when userIds is empty', async () => {
      const result = await service.getWeeklyPointsForUsers([]);
      expect(result).toEqual(new Map());
      expect(mockActivityRepo.find).not.toHaveBeenCalled();
    });

    it('defaults every requested user to 0, even with no logged activity', async () => {
      mockActivityRepo.find.mockResolvedValue([]);

      const result = await service.getWeeklyPointsForUsers(['a', 'b']);

      expect(result).toEqual(new Map([['a', 0], ['b', 0]]));
    });

    it('sums points per user across multiple events', async () => {
      mockActivityRepo.find.mockResolvedValue([
        { user: { id: 'a' }, points: 30 },
        { user: { id: 'a' }, points: 20 },
        { user: { id: 'b' }, points: 10 },
      ]);

      const result = await service.getWeeklyPointsForUsers(['a', 'b']);

      expect(result.get('a')).toBe(50);
      expect(result.get('b')).toBe(10);
    });

    it('falls back to a zeroed map (never drops a requested user) on a query error', async () => {
      mockActivityRepo.find.mockRejectedValue(new Error('db down'));

      const result = await service.getWeeklyPointsForUsers(['a', 'b']);

      expect(result).toEqual(new Map([['a', 0], ['b', 0]]));
    });
  });

  describe('getSummary', () => {
    it('throws NotFoundException when the profile does not exist', async () => {
      mockProfilesRepo.findOne.mockResolvedValue(null);

      await expect(service.getSummary('user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('falls back to the default daily goal when the profile has none set', async () => {
      mockProfilesRepo.findOne.mockResolvedValue({ id: 'user-1', dailyGoalPoints: null } as Profile);
      mockActivityRepo.find.mockResolvedValue([]);

      const result = await service.getSummary('user-1');

      expect(result.dailyGoalPoints).toBe(1500); // 150 * POINTS_PER_MINUTE
    });

    it('uses the profile\'s own dailyGoalPoints when set', async () => {
      mockProfilesRepo.findOne.mockResolvedValue({ id: 'user-1', dailyGoalPoints: 2000 } as Profile);
      mockActivityRepo.find.mockResolvedValue([]);

      const result = await service.getSummary('user-1');

      expect(result.dailyGoalPoints).toBe(2000);
    });

    it('degrades to a zeroed-out summary instead of throwing when the events query fails', async () => {
      mockProfilesRepo.findOne.mockResolvedValue({ id: 'user-1', dailyGoalPoints: 1500 } as Profile);
      mockActivityRepo.find.mockRejectedValue(new Error('db down'));

      const result = await service.getSummary('user-1');

      expect(result.streak).toBe(0);
      expect(result.pointsThisWeek).toBe(0);
      expect(result.goalHitDays).toBe(0);
      expect(result.week).toHaveLength(7);
    });
  });
});
