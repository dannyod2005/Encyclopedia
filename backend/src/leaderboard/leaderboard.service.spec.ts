import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LeaderboardService } from './leaderboard.service';
import { Profile } from '../profiles/entities/profile.entity';
import { ActivityService } from '../activity/activity.service';

// #498 — getRankings is the entire leaderboard feature's logic in one
// method: the opt-in filter (#231, so an opted-out learner must never
// leak in), the rank/points/isSelf shape LeaderboardScreen renders
// directly, and the tie-break ordering. A bug here either leaks a
// private learner's standing or silently reorders the board.
describe('LeaderboardService', () => {
  let service: LeaderboardService;

  const mockProfilesRepo = { find: jest.fn() };
  const mockActivityService = { getWeeklyPointsForUsers: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaderboardService,
        { provide: getRepositoryToken(Profile), useValue: mockProfilesRepo },
        { provide: ActivityService, useValue: mockActivityService },
      ],
    }).compile();

    service = module.get<LeaderboardService>(LeaderboardService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('queries only opted-in profiles, so an opted-out learner never appears', async () => {
    mockProfilesRepo.find.mockResolvedValue([]);

    await service.getRankings('user-1');

    expect(mockProfilesRepo.find).toHaveBeenCalledWith({
      where: { leaderboardOptIn: true },
    });
  });

  it('returns an empty array (and skips the points lookup) when no one has opted in', async () => {
    mockProfilesRepo.find.mockResolvedValue([]);

    const result = await service.getRankings('user-1');

    expect(result).toEqual([]);
    expect(mockActivityService.getWeeklyPointsForUsers).not.toHaveBeenCalled();
  });

  it('ranks by weekly points descending, 1-indexed', async () => {
    mockProfilesRepo.find.mockResolvedValue([
      { id: 'a', name: 'Alice', leaderboardOptIn: true },
      { id: 'b', name: 'Bob', leaderboardOptIn: true },
      { id: 'c', name: 'Cara', leaderboardOptIn: true },
    ]);
    mockActivityService.getWeeklyPointsForUsers.mockResolvedValue(
      new Map([
        ['a', 50],
        ['b', 200],
        ['c', 100],
      ]),
    );

    const result = await service.getRankings('a');

    expect(result.map((r) => r.id)).toEqual(['b', 'c', 'a']);
    expect(result.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('breaks a points tie by name so ordering is deterministic', async () => {
    mockProfilesRepo.find.mockResolvedValue([
      { id: 'z', name: 'Zed', leaderboardOptIn: true },
      { id: 'a', name: 'Amy', leaderboardOptIn: true },
    ]);
    mockActivityService.getWeeklyPointsForUsers.mockResolvedValue(
      new Map([
        ['z', 100],
        ['a', 100],
      ]),
    );

    const result = await service.getRankings('z');

    expect(result.map((r) => r.name)).toEqual(['Amy', 'Zed']);
  });

  it('defaults a user with no recorded activity to 0 points rather than dropping them', async () => {
    mockProfilesRepo.find.mockResolvedValue([
      { id: 'a', name: 'Alice', leaderboardOptIn: true },
    ]);
    mockActivityService.getWeeklyPointsForUsers.mockResolvedValue(new Map());

    const result = await service.getRankings('a');

    expect(result).toEqual([
      { rank: 1, id: 'a', name: 'Alice', weeklyPoints: 0, isSelf: true },
    ]);
  });

  it('falls back to a generic display name when profile.name is empty', async () => {
    mockProfilesRepo.find.mockResolvedValue([
      { id: 'a', name: '', leaderboardOptIn: true },
    ]);
    mockActivityService.getWeeklyPointsForUsers.mockResolvedValue(
      new Map([['a', 10]]),
    );

    const result = await service.getRankings('someone-else');

    expect(result[0].name).toBe('Encyclopedia Learner');
    expect(result[0].isSelf).toBe(false);
  });

  it('marks isSelf true only for the requesting user\'s own row', async () => {
    mockProfilesRepo.find.mockResolvedValue([
      { id: 'a', name: 'Alice', leaderboardOptIn: true },
      { id: 'b', name: 'Bob', leaderboardOptIn: true },
    ]);
    mockActivityService.getWeeklyPointsForUsers.mockResolvedValue(
      new Map([
        ['a', 10],
        ['b', 20],
      ]),
    );

    const result = await service.getRankings('a');

    const alice = result.find((r) => r.id === 'a');
    const bob = result.find((r) => r.id === 'b');
    expect(alice.isSelf).toBe(true);
    expect(bob.isSelf).toBe(false);
  });
});
