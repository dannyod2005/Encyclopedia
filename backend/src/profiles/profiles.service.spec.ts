import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { Profile } from './entities/profile.entity';

// #498 — every settings-style write (goal, role, daily goal, name,
// leaderboard opt-in) funnels through getMine() for its 404 guard, and
// updateName additionally trims/validates before writing — this is the
// only place that happens server-side (the frontend's own maxLength
// doesn't stop an all-whitespace submission).
describe('ProfilesService', () => {
  let service: ProfilesService;

  const mockProfilesRepo = {
    findOne: jest.fn(),
    save: jest.fn((x: Record<string, unknown>) => Promise.resolve(x)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfilesService,
        { provide: getRepositoryToken(Profile), useValue: mockProfilesRepo },
      ],
    }).compile();

    service = module.get<ProfilesService>(ProfilesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMine', () => {
    it('throws NotFoundException when no profile exists for the user', async () => {
      mockProfilesRepo.findOne.mockResolvedValue(null);

      await expect(service.getMine('user-1')).rejects.toThrow(NotFoundException);
    });

    it('returns the profile when found', async () => {
      const profile = { id: 'user-1' } as Profile;
      mockProfilesRepo.findOne.mockResolvedValue(profile);

      await expect(service.getMine('user-1')).resolves.toBe(profile);
    });
  });

  describe('updateGoal', () => {
    it('sets goal and saves', async () => {
      mockProfilesRepo.findOne.mockResolvedValue({ id: 'user-1', goal: null } as Profile);

      const result = await service.updateGoal('user-1', 'business');

      expect(result.goal).toBe('business');
      expect(mockProfilesRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ goal: 'business' }),
      );
    });
  });

  describe('updateRole', () => {
    it('sets role and saves', async () => {
      mockProfilesRepo.findOne.mockResolvedValue({ id: 'user-1', role: null } as Profile);

      const result = await service.updateRole('user-1', 'trainer');

      expect(result.role).toBe('trainer');
    });
  });

  describe('updateDailyGoal', () => {
    it('sets dailyGoalPoints and saves', async () => {
      mockProfilesRepo.findOne.mockResolvedValue({ id: 'user-1' } as Profile);

      const result = await service.updateDailyGoal('user-1', 1500);

      expect(result.dailyGoalPoints).toBe(1500);
    });
  });

  describe('updateName', () => {
    it('trims surrounding whitespace before saving', async () => {
      mockProfilesRepo.findOne.mockResolvedValue({ id: 'user-1' } as Profile);

      const result = await service.updateName('user-1', '  Jordan Lee  ');

      expect(result.name).toBe('Jordan Lee');
    });

    it('throws BadRequestException for an empty name', async () => {
      mockProfilesRepo.findOne.mockResolvedValue({ id: 'user-1' } as Profile);

      await expect(service.updateName('user-1', '')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for a whitespace-only name', async () => {
      mockProfilesRepo.findOne.mockResolvedValue({ id: 'user-1' } as Profile);

      await expect(service.updateName('user-1', '   ')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockProfilesRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('updateLeaderboardOptIn', () => {
    it('sets leaderboardOptIn true', async () => {
      mockProfilesRepo.findOne.mockResolvedValue({ id: 'user-1', leaderboardOptIn: false } as Profile);

      const result = await service.updateLeaderboardOptIn('user-1', true);

      expect(result.leaderboardOptIn).toBe(true);
    });

    it('sets leaderboardOptIn false', async () => {
      mockProfilesRepo.findOne.mockResolvedValue({ id: 'user-1', leaderboardOptIn: true } as Profile);

      const result = await service.updateLeaderboardOptIn('user-1', false);

      expect(result.leaderboardOptIn).toBe(false);
    });
  });
});
